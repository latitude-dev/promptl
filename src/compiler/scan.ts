import sha256 from 'fast-sha256'

import {
  CUSTOM_MESSAGE_ROLE_ATTR,
  REFERENCE_DEPTH_LIMIT,
  REFERENCE_PATH_ATTR,
  TAG_NAMES,
} from '$promptl/constants'
import CompileError, { error } from '$promptl/error/error'
import errors from '$promptl/error/errors'
import { parse } from '$promptl/parser/index'
import type {
  Attribute,
  BaseNode,
  ContentTag,
  ElementTag,
  Fragment,
  TemplateNode,
} from '$promptl/parser/interfaces'
import {
  Config,
  ContentTypeTagName,
  ConversationMetadata,
  MessageRole,
} from '$promptl/types'
import { Node as LogicalExpression } from 'estree'
import yaml, { Node as YAMLItem } from 'yaml'
import { z } from 'zod'

import { updateScopeContextForNode } from './logic'
import { ScopeContext } from './scope'
import { Document, ReferencePromptFn } from './types'
import {
  findYAMLItemPosition,
  getMostSpecificError,
  isChainStepTag,
  isContentTag,
  isMessageTag,
  isRefTag,
  isScopeTag,
  isZodError,
} from './utils'

function copyScopeContext(scopeContext: ScopeContext): ScopeContext {
  return {
    ...scopeContext,
    definedVariables: new Set(scopeContext.definedVariables),
  }
}

export class Scan {
  includedPromptPaths: Set<string>

  private rawText: string
  private referenceFn?: ReferencePromptFn
  private fullPath: string
  private withParameters?: string[]
  private requireConfig: boolean
  private configSchema?: z.ZodType

  private config?: Config
  private configPosition?: { start: number; end: number }
  private resolvedPrompt: string
  private resolvedPromptOffset: number = 0
  private hasContent: boolean = false
  private stepTagsCount: number = 0

  private accumulatedToolCalls: ContentTag[] = []
  private errors: CompileError[] = []

  private references: { [from: string]: string[] } = {}
  private referencedHashes: string[] = []
  private referenceDepth: number = 0
  private serialized?: Fragment

  constructor({
    document,
    referenceFn,
    withParameters,
    configSchema,
    requireConfig,
    serialized,
  }: {
    document: Document
    referenceFn?: ReferencePromptFn
    withParameters?: string[]
    configSchema?: z.ZodType
    requireConfig?: boolean
    serialized?: Fragment
  }) {
    this.serialized = serialized
    this.rawText = document.content
    this.referenceFn = referenceFn
    this.fullPath = document.path
    this.withParameters = withParameters
    this.configSchema = configSchema
    this.requireConfig = requireConfig ?? false

    this.resolvedPrompt = document.content
    this.includedPromptPaths = new Set([this.fullPath])
  }

  async run(): Promise<ConversationMetadata> {
    const scopeContext = {
      onlyPredefinedVariables: this.withParameters
        ? new Set(this.withParameters)
        : undefined,
      usedUndefinedVariables: new Set<string>(),
      definedVariables: new Set<string>(),
    }

    let fragment: Fragment

    try {
      fragment = this.serialized ?? parse(this.rawText)
    } catch (e) {
      const parseError = e as CompileError
      if (parseError instanceof CompileError) {
        this.errors.push(parseError)
        fragment = parseError.fragment!
      } else {
        throw parseError
      }
    }

    await this.readBaseMetadata({
      node: fragment,
      scopeContext,
      isInsideStepTag: false,
      isInsideMessageTag: false,
      isInsideContentTag: false,
      isRoot: true,
    })

    if (this.requireConfig && !this.config) {
      this.baseNodeError(errors.missingConfig, fragment, { start: 0, end: 0 })
    }

    const resolvedPrompt =
      Object.keys(this.config ?? {}).length > 0
        ? '---\n' +
          yaml.stringify(this.config, { indent: 2 }) +
          '---\n' +
          this.resolvedPrompt
        : this.resolvedPrompt

    const setConfig = (config: Config) => {
      const start = this.configPosition?.start ?? 0
      const end = this.configPosition?.end ?? 0

      if (Object.keys(config).length === 0) {
        return this.rawText.slice(0, start) + this.rawText.slice(end)
      }

      return (
        this.rawText.slice(0, start) +
        '---\n' +
        yaml.stringify(config, { indent: 2 }) +
        '---\n' +
        this.rawText.slice(end)
      )
    }

    const content = new TextEncoder().encode(
      [this.rawText, ...this.referencedHashes].join(''),
    )
    const hash = Array.from(sha256(content))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return {
      parameters: new Set([
        ...scopeContext.usedUndefinedVariables,
        ...(scopeContext.onlyPredefinedVariables ?? new Set([])),
      ]),
      hash,
      ast: fragment,
      resolvedPrompt,
      config: this.config ?? {},
      errors: this.errors,
      setConfig,
      isChain: this.stepTagsCount > 1,
      includedPromptPaths: this.includedPromptPaths,
    }
  }

  private async updateScopeContext({
    node,
    scopeContext,
  }: {
    node: LogicalExpression
    scopeContext: ScopeContext
  }): Promise<void> {
    await updateScopeContextForNode({
      node,
      scopeContext,
      raiseError: this.expressionError.bind(this),
    })
  }

  private async listTagAttributes({
    tagNode,
    scopeContext,
    literalAttributes = [], // Tags that don't allow Mustache expressions
  }: {
    tagNode: ElementTag
    scopeContext: ScopeContext
    literalAttributes?: string[]
  }): Promise<Set<string>> {
    const attributeNodes = tagNode.attributes
    if (attributeNodes.length === 0) return new Set()

    const attributes: Set<string> = new Set()
    for (const attributeNode of attributeNodes) {
      const { name, value } = attributeNode
      if (value === true) {
        attributes.add(name)
        continue
      }

      if (literalAttributes.includes(name)) {
        if (value.some((node) => node.type === 'MustacheTag')) {
          this.baseNodeError(
            errors.invalidStaticAttribute(name),
            value.find((node) => node.type === 'MustacheTag')!,
          )
          continue
        }
      }

      for await (const node of value) {
        if (node.type === 'MustacheTag') {
          const expression = node.expression
          await this.updateScopeContext({ node: expression, scopeContext })
        }
      }

      attributes.add(name)
    }

    return attributes
  }

  private async readBaseMetadata({
    node,
    scopeContext,
    isInsideStepTag,
    isInsideMessageTag,
    isInsideContentTag,
    isRoot = false,
  }: {
    node: TemplateNode
    scopeContext: ScopeContext
    isInsideStepTag: boolean
    isInsideMessageTag: boolean
    isInsideContentTag: boolean
    isRoot?: boolean
  }): Promise<void> {
    if (node.type === 'Fragment') {
      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext,
          isInsideStepTag,
          isInsideMessageTag,
          isInsideContentTag,
          isRoot,
        })
      }
      return
    }

    if (node.type === 'Comment' || node.type === 'Config') {
      /* Remove from the resolved prompt */
      const start = node.start! + this.resolvedPromptOffset
      const end = node.end! + this.resolvedPromptOffset
      this.resolvedPrompt =
        this.resolvedPrompt.slice(0, start) + this.resolvedPrompt.slice(end)
      this.resolvedPromptOffset -= end - start
    }

    if (node.type === 'Config') {
      if (this.config) {
        this.baseNodeError(errors.configAlreadyDeclared, node)
      }
      if (!isRoot) {
        this.baseNodeError(errors.configOutsideRoot, node)
      }
      if (this.hasContent) {
        this.baseNodeError(errors.invalidConfigPlacement, node)
      }

      this.configPosition = { start: node.start!, end: node.end! }

      const parsedYaml = yaml.parseDocument(node.value, {
        keepSourceTokens: true,
      })

      const CONFIG_START_OFFSET = 3 // The config is always offsetted by 3 characters due to the `---`

      if (parsedYaml.errors.length) {
        parsedYaml.errors.forEach((error) => {
          const [errorStart, errorEnd] = error.pos
          this.baseNodeError(errors.invalidConfig(error.message), node, {
            start: node.start! + CONFIG_START_OFFSET + errorStart,
            end: node.start! + CONFIG_START_OFFSET + errorEnd,
          })
        })
      }

      let parsedObj = {}

      try {
        parsedObj = parsedYaml.toJS() ?? {}
        this.configSchema?.parse(parsedObj)
      } catch (err) {
        if (isZodError(err)) {
          err.errors.forEach((error) => {
            const { message, path } = getMostSpecificError(error)

            const range = findYAMLItemPosition(
              parsedYaml.contents as YAMLItem,
              path,
            )

            const errorStart = range
              ? node.start! + CONFIG_START_OFFSET + range[0]
              : node.start!
            const errorEnd = range
              ? node.start! + CONFIG_START_OFFSET + range[1] + 1
              : node.end!

            this.baseNodeError(errors.invalidConfig(message), node, {
              start: errorStart,
              end: errorEnd,
            })
          })
        } else if (err instanceof ReferenceError) {
          this.baseNodeError(errors.invalidConfig(err.message), node)
        }
      }

      this.config = parsedObj
      return
    }

    if (node.type === 'Text') {
      if (node.data.trim()) {
        this.hasContent = true
      }
      /* do nothing */
      return
    }

    if (node.type === 'Comment') {
      /* do nothing */
      return
    }

    if (node.type === 'MustacheTag') {
      this.hasContent = true
      const expression = node.expression
      await this.updateScopeContext({ node: expression, scopeContext })
      return
    }

    if (node.type === 'IfBlock') {
      await this.updateScopeContext({ node: node.expression, scopeContext })
      const ifScope = copyScopeContext(scopeContext)
      const elseScope = copyScopeContext(scopeContext)
      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: ifScope,
          isInsideStepTag,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      for await (const childNode of node.else?.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: elseScope,
          isInsideStepTag,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      return
    }

    if (node.type === 'ForBlock') {
      await this.updateScopeContext({ node: node.expression, scopeContext })

      const elseScope = copyScopeContext(scopeContext)
      for await (const childNode of node.else?.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: elseScope,
          isInsideStepTag,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }

      const contextVarName = node.context.name
      const indexVarName = node.index?.name
      if (scopeContext.definedVariables.has(contextVarName)) {
        this.expressionError(
          errors.variableAlreadyDeclared(contextVarName),
          node.context,
        )
        return
      }
      if (indexVarName && scopeContext.definedVariables.has(indexVarName)) {
        this.expressionError(
          errors.variableAlreadyDeclared(indexVarName),
          node.index!,
        )
        return
      }

      const iterableScope = copyScopeContext(scopeContext)
      iterableScope.definedVariables.add(contextVarName)
      if (indexVarName) {
        iterableScope.definedVariables.add(indexVarName)
      }
      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: iterableScope,
          isInsideStepTag,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      return
    }

    if (node.type === 'ElementTag') {
      this.hasContent = true

      if (isContentTag(node)) {
        if (isInsideContentTag) {
          this.baseNodeError(errors.contentTagInsideContent, node)
        }

        if (node.name === ContentTypeTagName.toolCall) {
          this.accumulatedToolCalls.push(node)

          const attributes = await this.listTagAttributes({
            tagNode: node,
            scopeContext,
          })

          if (!attributes.has('id')) {
            this.baseNodeError(errors.toolCallTagWithoutId, node)
          }

          if (!attributes.has('name')) {
            this.baseNodeError(errors.toolCallWithoutName, node)
          }
        }

        for await (const childNode of node.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext,
            isInsideStepTag,
            isInsideMessageTag,
            isInsideContentTag: true,
          })
        }
        return
      }

      if (isMessageTag(node)) {
        if (isInsideContentTag || isInsideMessageTag) {
          this.baseNodeError(errors.messageTagInsideMessage, node)
        }

        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
        })

        const role = node.name as MessageRole
        if (node.name === TAG_NAMES.message) {
          if (!attributes.has(CUSTOM_MESSAGE_ROLE_ATTR)) {
            this.baseNodeError(errors.messageTagWithoutRole, node)
            return
          }
          attributes.delete(CUSTOM_MESSAGE_ROLE_ATTR)
        }

        if (role === MessageRole.tool && !attributes.has('id')) {
          this.baseNodeError(errors.toolMessageWithoutId, node)
          return
        }

        if (role === MessageRole.tool && !attributes.has('name')) {
          this.baseNodeError(errors.toolMessageWithoutName, node)
          return
        }

        if (this.accumulatedToolCalls.length > 0) {
          this.accumulatedToolCalls.forEach((toolCallNode) => {
            this.baseNodeError(errors.invalidToolCallPlacement, toolCallNode)
            return
          })
        }
        this.accumulatedToolCalls = []

        for await (const childNode of node.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext,
            isInsideStepTag,
            isInsideMessageTag: true,
            isInsideContentTag,
          })
        }

        if (
          role !== MessageRole.assistant &&
          this.accumulatedToolCalls.length > 0
        ) {
          this.accumulatedToolCalls.forEach((toolCallNode) => {
            this.baseNodeError(errors.invalidToolCallPlacement, toolCallNode)
            return
          })
        }

        this.accumulatedToolCalls = []
        return
      }

      if (isRefTag(node)) {
        if (node.children?.length ?? 0 > 0) {
          this.baseNodeError(errors.referenceTagHasContent, node)
          return
        }

        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
          literalAttributes: [REFERENCE_PATH_ATTR],
        })

        if (!attributes.has(REFERENCE_PATH_ATTR)) {
          this.baseNodeError(errors.referenceTagWithoutPath, node)
          return
        }

        if (!this.referenceFn) {
          this.baseNodeError(errors.missingReferenceFunction, node)
          return
        }

        if (this.referenceDepth > REFERENCE_DEPTH_LIMIT) {
          this.baseNodeError(errors.referenceDepthLimit, node)
          return
        }

        const refPromptAttribute = node.attributes.find(
          (attribute: Attribute) => attribute.name === REFERENCE_PATH_ATTR,
        ) as Attribute

        const refPromptPath = (refPromptAttribute.value as TemplateNode[])
          .map((node) => node.data)
          .join('')

        attributes.delete(REFERENCE_PATH_ATTR) // The rest of the attributes are used as parameters

        const currentReferences = this.references[this.fullPath] ?? []

        const start = node.start! + this.resolvedPromptOffset
        const end = node.end! + this.resolvedPromptOffset
        let resolvedRefPrompt = this.resolvedPrompt.slice(start, end)

        const resolveRef = async () => {
          if (!this.referenceFn) {
            this.baseNodeError(errors.missingReferenceFunction, node)
            return
          }

          if (currentReferences.includes(refPromptPath)) {
            this.baseNodeError(errors.circularReference, node)
            return
          }

          const refDocument = await this.referenceFn(
            refPromptPath,
            this.fullPath,
          )

          if (!refDocument) {
            this.baseNodeError(errors.referenceNotFound, node)
            return
          }

          const refScan = new Scan({
            document: refDocument,
            referenceFn: this.referenceFn,
          })
          refScan.accumulatedToolCalls = this.accumulatedToolCalls
          refScan.references = {
            ...this.references,
            [this.fullPath]: [...currentReferences, refPromptPath],
          }

          this.includedPromptPaths.add(refDocument.path)

          refScan.referenceDepth = this.referenceDepth + 1

          const refPromptMetadata = await refScan.run()
          refPromptMetadata.includedPromptPaths.forEach((path) => {
            this.includedPromptPaths.add(path)
          })

          refPromptMetadata.parameters.forEach((paramName: string) => {
            if (!attributes.has(paramName)) {
              this.baseNodeError(
                errors.referenceMissingParameter(paramName),
                node,
              )
            }
          })
          refPromptMetadata.errors.forEach((error: CompileError) => {
            if (
              error.code === 'reference-error' ||
              error.code === 'circular-reference'
            ) {
              this.baseNodeError(
                { code: error.code, message: error.message },
                node,
              )
              return
            }
            this.baseNodeError(errors.referenceError(error), node)
          })
          this.accumulatedToolCalls = refScan.accumulatedToolCalls
          this.referencedHashes.push(refPromptMetadata.hash)
          resolvedRefPrompt = refScan.resolvedPrompt
        }

        try {
          await resolveRef()
        } catch (error: unknown) {
          this.baseNodeError(errors.referenceError(error), node)
        }

        const pretext = this.resolvedPrompt.slice(0, start)
        const posttext = this.resolvedPrompt.slice(end)

        const attributeTags = node.attributes
          .filter((a) => a.name !== REFERENCE_PATH_ATTR)
          .map((attr) => {
            const attrStart = attr.start! + this.resolvedPromptOffset
            const attrEnd = attr.end! + this.resolvedPromptOffset
            return this.resolvedPrompt.slice(attrStart, attrEnd)
          })

        const resolvedNode =
          `<${TAG_NAMES.scope} ${attributeTags.join(' ')}>` +
          resolvedRefPrompt +
          `</${TAG_NAMES.scope}>`

        this.resolvedPrompt = pretext + resolvedNode + posttext
        this.resolvedPromptOffset += resolvedNode.length - (end - start)

        return
      }

      if (isScopeTag(node)) {
        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
        })

        const newScopeContext: ScopeContext = {
          onlyPredefinedVariables: scopeContext.onlyPredefinedVariables,
          usedUndefinedVariables: new Set<string>(),
          definedVariables: attributes,
        }

        for await (const childNode of node.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext: newScopeContext,
            isInsideStepTag,
            isInsideMessageTag,
            isInsideContentTag,
          })
        }

        newScopeContext.usedUndefinedVariables.forEach((variable) => {
          if (!attributes.has(variable)) {
            this.baseNodeError(errors.referenceMissingParameter(variable), node)
          }
        })

        return
      }

      if (isChainStepTag(node)) {
        this.stepTagsCount += 1
        if (isInsideStepTag) {
          this.baseNodeError(errors.stepTagInsideStep, node)
        }

        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
          literalAttributes: ['as', 'raw'],
        })

        for await (const childNode of node.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext,
            isInsideStepTag: true,
            isInsideMessageTag,
            isInsideContentTag,
          })
        }

        if (attributes.has('as')) {
          const asAttribute = node.attributes.find((a) => a.name === 'as')!
          if (asAttribute.value !== true) {
            const asValue = asAttribute.value.map((n) => n.data).join('')
            scopeContext.definedVariables.add(asValue)
          }
        }

        if (attributes.has('raw')) {
          const rawAttribute = node.attributes.find((a) => a.name === 'raw')!
          if (rawAttribute.value !== true) {
            const asValue = rawAttribute.value.map((n) => n.data).join('')
            scopeContext.definedVariables.add(asValue)
          }
        }

        return
      }

      // Should not be reachable, as non-recognized tags are caught by the parser
      this.baseNodeError(errors.unknownTag(node.name), node)
      return
    }

    //@ts-ignore - Linter knows this should be unreachable. That's what this error is for.
    this.baseNodeError(errors.unsupportedBaseNodeType(node.type), node)
  }

  private baseNodeError(
    { code, message }: { code: string; message: string },
    node: BaseNode,
    customPos?: { start: number; end: number },
  ): void {
    try {
      error(message, {
        name: 'CompileError',
        code,
        source: this.rawText || '',
        start: customPos?.start || node.start || 0,
        end: customPos?.end || node.end || undefined,
      })
    } catch (error) {
      this.errors.push(error as CompileError)
    }
  }

  private expressionError(
    { code, message }: { code: string; message: string },
    node: LogicalExpression,
  ): void {
    const source = (node.loc?.source ?? this.rawText)!.split('\n')
    const start =
      source
        .slice(0, node.loc?.start.line! - 1)
        .reduce((acc, line) => acc + line.length + 1, 0) +
      node.loc?.start.column!
    const end =
      source
        .slice(0, node.loc?.end.line! - 1)
        .reduce((acc, line) => acc + line.length + 1, 0) + node.loc?.end.column!

    try {
      error(message, {
        name: 'CompileError',
        code,
        source: this.rawText || '',
        start,
        end,
      })
    } catch (error) {
      this.errors.push(error as CompileError)
    }
  }
}
