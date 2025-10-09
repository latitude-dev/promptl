import { render } from '$promptl/compiler'
import { removeCommonIndent } from '$promptl/compiler/utils'
import { MessageRole, ContentType } from '$promptl/types'
import { describe, it, expect } from 'vitest'

import { Adapters } from '..'

describe('VercelAIAdapter', () => {
  it('adapts system messages', async () => {
    const prompt = `You are a helpful assistant`
    const { messages } = await render({
      prompt,
      adapter: Adapters['vercel'],
    })
    expect(messages).toEqual([
      {
        role: MessageRole.system,
        content: 'You are a helpful assistant',
      },
    ])
  })

  it('adapts user messages', async () => {
    const prompt = removeCommonIndent(`
      <user>
        Hello world!
        <content-image>https://image.source/</content-image>
        <content-file mime="text/plain">text content</content-file>
      </user>
    `)

    const { messages } = await render({
      prompt,
      adapter: Adapters['vercel'],
    })
    expect(messages).toEqual([
      {
        role: MessageRole.user,
        content: [
          { type: ContentType.text, text: 'Hello world!' },
          { type: ContentType.image, image: 'https://image.source/' },
          {
            type: ContentType.file,
            data: 'text content',
            mediaType: 'text/plain',
          },
        ],
      },
    ])
  })

  it('adapts assistant messages', async () => {
    const prompt = removeCommonIndent(`
      <assistant>
        I will help you with that.
      </assistant>
    `)

    const { messages } = await render({
      prompt,
      adapter: Adapters['vercel'],
    })
    expect(messages).toEqual([
      {
        role: MessageRole.assistant,
        content: [
          { type: ContentType.text, text: 'I will help you with that.' },
        ],
      },
    ])
  })

  it('adapts tool messages', async () => {
    const prompt = removeCommonIndent(`
      <tool id="call_123" name="get_weather">
        The weather is sunny.
      </tool>
    `)

    const { messages } = await render({
      prompt,
      adapter: Adapters['vercel'],
    })
    expect(messages).toEqual([
      {
        role: MessageRole.tool,
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_123',
            toolName: 'get_weather',
            result: 'The weather is sunny.',
          },
        ],
      },
    ])
  })

  it('adapts system messages with config', async () => {
    const prompt = removeCommonIndent(`
      ---
      temperature: 0.8
      maxTokens: 1000
      ---
      You are a helpful assistant
    `)

    const { messages, config } = await render({
      prompt,
      adapter: Adapters['vercel'],
    })
    expect(config).toEqual({ temperature: 0.8, maxTokens: 1000 })
    expect(messages).toEqual([
      {
        role: MessageRole.system,
        content: 'You are a helpful assistant',
      },
    ])
  })

  it('handles assistant messages with tool calls', async () => {
    const prompt = removeCommonIndent(`
      <assistant>
        I will help you with that.
        <tool-call id="call_123" name="get_weather">
          {"location": "San Francisco"}
        </tool-call>
      </assistant>
    `)

    const { messages } = await render({
      prompt,
      adapter: Adapters['vercel'],
    })

    expect(messages).toHaveLength(1)
    expect(messages[0]?.role).toBe(MessageRole.assistant)
    expect(messages[0]?.content).toHaveLength(2)
    expect(messages[0]?.content[0]).toEqual({
      type: ContentType.text,
      text: 'I will help you with that.',
    })
    expect(messages[0]?.content[1]).toMatchObject({
      type: ContentType.toolCall,
      toolCallId: 'call_123',
      toolName: 'get_weather',
    })
    expect(messages[0]?.content[1]).toHaveProperty('args')
  })
})
