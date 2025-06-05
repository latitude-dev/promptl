import {
  deserializeChain,
  SerializedProps,
} from '$promptl/compiler/deserializeChain'
import { CHAIN_STEP_ISOLATED_ATTR } from '$promptl/constants'
import { parse } from '$promptl/parser'
import { Fragment } from '$promptl/parser/interfaces'
import {
  AdapterMessageType,
  Adapters,
  ProviderAdapter,
} from '$promptl/providers'
import { ProviderConversation } from '$promptl/providers/adapter'
import {
  Config,
  ContentType,
  Message,
  MessageContent,
  MessageRole,
} from '$promptl/types'

import { Compile } from './compile'
import Scope from './scope'
import { CompileOptions } from './types'

type ChainStep<M extends AdapterMessageType> = ProviderConversation<M> & {
  completed: boolean
}

type HasRole<T> = 'role' extends keyof T ? { role?: T['role'] } : {}
export type StepResponse<M extends AdapterMessageType> =
  | string
  | M[]
  | (Omit<M, 'role'> & HasRole<M>)

type BuildStepResponseContent = {
  messages?: Message[]
  contents: MessageContent[] | undefined
}

export class Chain<M extends AdapterMessageType = Message> {
  public rawText: string

  private _completed: boolean = false
  private adapter: ProviderAdapter<M>
  private ast: Fragment
  private compileOptions: CompileOptions
  private didStart: boolean = false
  private globalConfig: Config | undefined
  private globalMessages: Message[] = []
  private scope: Scope
  private wasLastStepIsolated: boolean = false

  static deserialize(args: SerializedProps) {
    return deserializeChain(args)
  }

  constructor({
    prompt,
    parameters = {},
    serialized,
    adapter = Adapters.openai as ProviderAdapter<M>,
    ...compileOptions
  }: {
    prompt: string
    parameters?: Record<string, unknown>
    adapter?: ProviderAdapter<M>
    serialized?: {
      ast?: Fragment
      scope?: Scope
      didStart?: boolean
      completed?: boolean
      globalConfig?: Config
      globalMessages?: Message[]
    }
  } & CompileOptions) {
    this.rawText = prompt
    this.ast = serialized?.ast ?? parse(prompt)
    this.scope = serialized?.scope ?? new Scope(parameters)
    this.didStart = serialized?.didStart ?? false
    this._completed = serialized?.completed ?? false
    this.globalConfig = serialized?.globalConfig
    this.globalMessages = serialized?.globalMessages ?? []
    this.adapter = adapter
    this.compileOptions = compileOptions

    if (this.adapter !== Adapters.default) {
      this.compileOptions.includeSourceMap = false
    }
  }

  async step(response?: StepResponse<M>): Promise<ChainStep<M>> {
    if (this._completed) {
      throw new Error('The chain has already completed')
    }

    if (!this.didStart && response !== undefined) {
      throw new Error('A response is not allowed before the chain has started')
    }

    if (this.didStart && response === undefined) {
      throw new Error('A response is required to continue the chain')
    }

    this.didStart = true

    const responseContent = this.buildStepResponseContent(response)
    const newGlobalMessages = this.buildGlobalMessages(responseContent)

    if (newGlobalMessages.length > 0) {
      this.globalMessages = [
        ...this.globalMessages,
        ...(newGlobalMessages as Message[]),
      ]
    }

    const compile = new Compile({
      ast: this.ast,
      rawText: this.rawText,
      globalScope: this.scope,
      stepResponse: responseContent.contents,
      ...this.compileOptions,
    })

    const { completed, scopeStash, ast, messages, globalConfig, stepConfig } =
      await compile.run()

    this.scope = Scope.withStash(scopeStash).copy(this.scope.getPointers())
    this.ast = ast

    this.globalConfig = globalConfig ?? this.globalConfig

    // If it returned a message, there is still a final step to be taken
    this._completed = completed && !messages.length

    const config = {
      ...this.globalConfig,
      ...stepConfig,
    }

    this.wasLastStepIsolated = !!config[CHAIN_STEP_ISOLATED_ATTR]

    const stepMessages = [
      ...(this.wasLastStepIsolated ? [] : this.globalMessages),
      ...messages,
    ]

    if (!this.wasLastStepIsolated) {
      this.globalMessages.push(...messages)
    }

    return {
      ...this.adapter.fromPromptl({
        messages: stepMessages,
        config,
      }),
      completed: this._completed,
    }
  }

  serialize() {
    return {
      ast: this.ast,
      scope: this.scope.serialize(),
      didStart: this.didStart,
      completed: this._completed,
      adapterType: this.adapter.type,
      compilerOptions: this.compileOptions,
      globalConfig: this.globalConfig,
      globalMessages: this.globalMessages,
      rawText: this.rawText,
    }
  }

  get globalMessagesCount(): number {
    return this.globalMessages.length
  }

  get completed(): boolean {
    return this._completed
  }

  private buildStepResponseContent(
    response?: StepResponse<M> | M[],
  ): BuildStepResponseContent {
    if (response == undefined) return { contents: undefined }
    if (typeof response === 'string') {
      return { contents: [{ text: response, type: ContentType.text }] }
    }

    if (Array.isArray(response)) {
      const converted = this.adapter.toPromptl({
        config: this.globalConfig ?? {},
        messages: response as M[],
      })
      const contents = converted.messages.flatMap((m) => m.content)
      return { messages: converted.messages as Message[], contents }
    }

    const responseMessage = {
      ...response,
      role: 'role' in response ? response.role : MessageRole.assistant,
    } as M

    const convertedMessages = this.adapter.toPromptl({
      config: this.globalConfig ?? {},
      messages: [responseMessage],
    })

    return { contents: convertedMessages.messages[0]!.content }
  }

  private buildGlobalMessages(
    buildStepResponseContent: BuildStepResponseContent,
  ) {
    const { messages, contents } = buildStepResponseContent

    if (this.wasLastStepIsolated) return []
    if (!contents) return []

    if (messages) return messages

    return [
      {
        role: MessageRole.assistant,
        content: contents ?? [],
      },
    ]
  }
}
