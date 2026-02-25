import { describe, expect, it } from 'vitest'

import { render, scan, Chain } from '$promptl/compiler'
import { Adapters } from '$promptl/providers'
import { complete } from '$promptl/compiler/test/helpers'
import { removeCommonIndent } from '$promptl/compiler/utils'
import { MessageRole, SystemMessage, TextContent } from '$promptl/types'
import { buildReferenceFn } from './references'

describe('buildReferenceFn', () => {
  it('resolves a simple reference by absolute path', async () => {
    const references = {
      child: 'child content',
    }

    const result = await render({
      prompt: '<prompt path="child" />',
      referenceFn: buildReferenceFn(references),
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
    const msg = result.messages[0]! as SystemMessage
    expect(msg.content).toEqual([{ type: 'text', text: 'child content' }])
  })

  it('resolves relative paths using from context', async () => {
    const references = {
      'folder/child': 'resolved child',
    }

    const result = await render({
      prompt: '<prompt path="./child" />',
      fullPath: 'folder/parent',
      referenceFn: buildReferenceFn(references),
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
    const msg = result.messages[0]! as SystemMessage
    expect(msg.content).toEqual([{ type: 'text', text: 'resolved child' }])
  })

  it('resolves parent-relative paths with ..', async () => {
    const references = {
      sibling: 'sibling content',
    }

    const result = await render({
      prompt: '<prompt path="../sibling" />',
      fullPath: 'folder/parent',
      referenceFn: buildReferenceFn(references),
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
    const msg = result.messages[0]! as SystemMessage
    expect(msg.content).toEqual([{ type: 'text', text: 'sibling content' }])
  })

  it('resolves nested references recursively', async () => {
    const references = {
      child: '<prompt path="grandchild" />',
      grandchild: 'grandchild content',
    }

    const result = await render({
      prompt: '<prompt path="child" />',
      referenceFn: buildReferenceFn(references),
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
    const msg = result.messages[0]! as SystemMessage
    expect(msg.content).toEqual([{ type: 'text', text: 'grandchild content' }])
  })

  it('returns undefined for missing references', async () => {
    const fn = buildReferenceFn({})
    expect(fn).toBeDefined()
    const result = await fn!('nonexistent', undefined)
    expect(result).toBeUndefined()
  })

  it('returns undefined when references is undefined', () => {
    const fn = buildReferenceFn(undefined)
    expect(fn).toBeUndefined()
  })
})

describe('scanPrompt with references', () => {
  it('scans with references and returns includedPromptPaths', async () => {
    const references = {
      child: 'child {{ childParam }}',
    }

    const metadata = await scan({
      prompt: '<prompt path="child" childParam="hello" />',
      referenceFn: buildReferenceFn(references),
    })

    expect(metadata.errors.length).toBe(0)
    expect(metadata.includedPromptPaths).toContain('child')
  })

  it('produces different hashes for different referenced content', async () => {
    const parent = '<prompt path="child" />'

    const meta1 = await scan({
      prompt: parent,
      referenceFn: buildReferenceFn({ child: 'version 1' }),
    })

    const meta2 = await scan({
      prompt: parent,
      referenceFn: buildReferenceFn({ child: 'version 2' }),
    })

    expect(meta1.hash).not.toBe(meta2.hash)
  })

  it('detects circular references', async () => {
    const references = {
      parent: '<prompt path="child" />',
      child: '<prompt path="parent" />',
    }

    const metadata = await scan({
      prompt: references['parent']!,
      fullPath: 'parent',
      referenceFn: buildReferenceFn(references),
    })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]!.code).toBe('circular-reference')
  })

  it('reports error for missing referenced prompt', async () => {
    const metadata = await scan({
      prompt: '<prompt path="missing" />',
      referenceFn: buildReferenceFn({}),
    })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]!.code).toBe('reference-not-found')
  })

  it('works without references (backward compat)', async () => {
    const metadata = await scan({
      prompt: 'Hello {{ name }}',
    })

    expect(metadata.errors.length).toBe(0)
    expect(metadata.parameters).toContain('name')
  })
})

describe('renderPrompt with references', () => {
  it('renders with parameterized child prompts', async () => {
    const references = {
      child: 'Hello {{ greeting }}',
    }

    const result = await render({
      prompt: '<prompt path="child" greeting="world" />',
      referenceFn: buildReferenceFn(references),
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
    const msg = result.messages[0]! as SystemMessage
    expect(msg.content).toEqual([{ type: 'text', text: 'Hello world' }])
  })

  it('renders with references inside message tags', async () => {
    const references = {
      child: 'child text',
    }

    const result = await render({
      prompt: removeCommonIndent(`
        <user>
          <prompt path="child" />
        </user>
      `),
      referenceFn: buildReferenceFn(references),
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
    const msg = result.messages[0]!
    expect(msg.role).toBe(MessageRole.user)
  })

  it('works without references (backward compat)', async () => {
    const result = await render({
      prompt: 'Hello world',
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
  })
})

describe('createChain with pre-resolved references', () => {
  it('resolves references via scan then runs chain with resolvedPrompt', async () => {
    const references = {
      child: removeCommonIndent(`
        <step>
          <user>Child step</user>
        </step>
      `),
    }

    const referenceFn = buildReferenceFn(references)
    const metadata = await scan({
      prompt: removeCommonIndent(`
        <step>
          Parent step
        </step>
        <prompt path="child" />
      `),
      referenceFn,
    })

    const chain = new Chain({
      prompt: metadata.resolvedPrompt,
      adapter: Adapters.default,
    })

    const { steps, messages } = await complete({ chain })
    expect(steps).toBe(2)

    const stepTexts = messages
      .filter((m) => m.role !== MessageRole.assistant)
      .map((m) => (m.content[0] as TextContent).text)
    expect(stepTexts).toEqual(['Parent step', 'Child step'])
  })

  it('chain with resolvedPrompt does not need referenceFn', async () => {
    const references = {
      child: 'child content',
    }

    const referenceFn = buildReferenceFn(references)
    const metadata = await scan({
      prompt: '<prompt path="child" />',
      referenceFn,
    })

    const result = await render({
      prompt: metadata.resolvedPrompt,
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
    const msg = result.messages[0]! as SystemMessage
    expect(msg.content).toEqual([{ type: 'text', text: 'child content' }])
  })

  it('nested relative references are pre-resolved correctly', async () => {
    const references = {
      'folder/child': '<prompt path="./grandchild" />',
      'folder/grandchild': 'deep content',
    }

    const referenceFn = buildReferenceFn(references)
    const metadata = await scan({
      prompt: '<prompt path="folder/child" />',
      referenceFn,
    })

    expect(metadata.errors.length).toBe(0)

    const result = await render({
      prompt: metadata.resolvedPrompt,
      adapter: Adapters.default,
    })

    expect(result.messages.length).toBe(1)
    const msg = result.messages[0]! as SystemMessage
    expect(msg.content).toEqual([{ type: 'text', text: 'deep content' }])
  })
})
