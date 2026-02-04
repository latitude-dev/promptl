import { render } from '$promptl/compiler'
import { removeCommonIndent } from '$promptl/compiler/utils'
import { beforeAll, describe, expect, it } from 'vitest'

import { Adapters } from '../index'
import { MessageInputItem } from '$promptl/providers/openai-responses/types'

const toPromptl = Adapters.openaiResponses.toPromptl

describe('OpenAI response adapter', async () => {
  describe('#toPromptl', () => {
    it('parse plain text as user message', async () => {
      expect(
        toPromptl({
          config: {},
          // @ts-expect-error - We don't type string as posible value but is possible.
          messages: 'Hello world!',
        }),
      ).toEqual({
        config: {},
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello world!',
              },
            ],
          },
        ],
      })
    })

    it('parse user input item with content as string', async () => {
      expect(
        toPromptl({
          config: {},
          messages: [
            {
              type: 'message',
              role: 'user',
              content: 'Hello world!',
            },
          ],
        }),
      ).toEqual({
        config: {},
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello world!',
              },
            ],
          },
        ],
      })
    })

    it('parse assistant input item with array content', async () => {
      expect(
        toPromptl({
          config: {},
          messages: [
            {
              type: 'message',
              role: 'assistant',
              content: [
                { text: 'Hello world!', type: 'input_text' },
                {
                  detail: 'low',
                  type: 'input_image',
                  file_id: '1234',
                  image_url: 'https://image.source/',
                },
                {
                  type: 'input_file',
                  file_data: 'text content',
                  file_id: '5678',
                  filename: 'text.txt',
                },
              ],
            },
          ],
        }),
      ).toEqual({
        config: {},
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Hello world!',
              },
              {
                type: 'image',
                image: 'https://image.source/',
                detail: 'low',
              },
              {
                type: 'file',
                file: 'text content',
                filename: 'text.txt',
                file_id: '5678',
                mimeType: 'text/plain',
              },
            ],
          },
        ],
      })
    })

    it('parse user response message with status', async () => {
      expect(
        toPromptl({
          config: {},
          messages: [
            {
              type: 'message',
              status: 'in_progress',
              role: 'user',
              content: [
                {
                  text: 'Hello world!',
                  type: 'input_text',
                },
              ],
            },
          ],
        }),
      ).toEqual({
        config: {},
        messages: [
          {
            role: 'user',
            status: 'in_progress',
            content: [
              {
                type: 'text',
                text: 'Hello world!',
              },
            ],
          },
        ],
      })
    })

    it('parse reasoning', async () => {
      expect(
        toPromptl({
          config: {},
          messages: [
            {
              id: '1234',
              type: 'reasoning',
              status: 'in_progress',
              encrypted_content: 'encrypted content',
              summary: [
                {
                  text: 'Hello world!',
                  type: 'summary_text',
                },
              ],
            },
          ],
        }),
      ).toEqual({
        config: {},
        messages: [
          {
            id: '1234',
            role: 'assistant',
            status: 'in_progress',
            encrypted_content: 'encrypted content',
            content: [
              {
                type: 'text',
                text: 'Hello world!',
              },
            ],
          },
        ],
      })
    })

    it('parse output text', async () => {
      expect(
        toPromptl({
          config: {},
          messages: [
            {
              id: '1234',
              role: 'assistant',
              type: 'message',
              status: 'in_progress',
              content: [
                {
                  text: 'Hello world!',
                  type: 'output_text',
                  annotations: [
                    {
                      end_index: 0,
                      start_index: 22,
                      title: 'Some URL citation',
                      type: 'url_citation',
                      url: 'https://wikipedia.org/wiki/Hello_world',
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ).toEqual({
        config: {},
        messages: [
          {
            id: '1234',
            role: 'assistant',
            status: 'in_progress',
            content: [
              {
                type: 'text',
                text: 'Hello world!',
                annotations: [
                  {
                    end_index: 0,
                    start_index: 22,
                    title: 'Some URL citation',
                    type: 'url_citation',
                    url: 'https://wikipedia.org/wiki/Hello_world',
                  },
                ],
              },
            ],
          },
        ],
      })
    })

    it('parse output refusal', async () => {
      expect(
        toPromptl({
          config: {},
          messages: [
            {
              id: '1234',
              role: 'assistant',
              type: 'message',
              status: 'in_progress',
              content: [
                {
                  refusal: 'I have concerns',
                  type: 'refusal',
                },
              ],
            },
          ],
        }),
      ).toEqual({
        config: {},
        messages: [
          {
            id: '1234',
            role: 'assistant',
            status: 'in_progress',
            content: [
              {
                type: 'text',
                text: 'I have concerns',
              },
            ],
          },
        ],
      })
    })

    describe('builtin OpenAI tools', () => {
      describe('web search', () => {
        let messages: MessageInputItem[]
        beforeAll(() => {
          messages = [
            {
              id: 'ws_1234',
              type: 'web_search_call',
              status: 'in_progress',
            },
            {
              id: 'msg_1234',
              role: 'assistant',
              type: 'message',
              status: 'in_progress',
              content: [
                {
                  text: 'Hello world!',
                  type: 'output_text',
                  annotations: [
                    {
                      end_index: 0,
                      start_index: 22,
                      title: 'Some URL citation',
                      type: 'url_citation',
                      url: 'https://wikipedia.org/wiki/Hello_world',
                    },
                  ],
                },
              ],
            },
          ]
        })

        it('handle request and response', async () => {
          expect(
            toPromptl({
              config: {},
              messages,
            }),
          ).toEqual({
            config: {},
            messages: [
              {
                id: 'ws_1234',
                role: 'assistant',
                status: 'in_progress',
                content: [
                  {
                    type: 'tool-call',
                    toolCallId: '1234',
                    toolName: 'web_search_call',
                    toolArguments: {},
                  },
                ],
              },
              {
                id: 'msg_1234',
                role: 'assistant',
                status: 'in_progress',
                content: [
                  {
                    type: 'tool-call',
                    toolCallId: '1234',
                    toolName: 'web_search_call',
                    toolArguments: {
                      text: 'Hello world!',
                      annotations: [
                        {
                          end_index: 0,
                          start_index: 22,
                          title: 'Some URL citation',
                          type: 'url_citation',
                          url: 'https://wikipedia.org/wiki/Hello_world',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          })
        })
      })

      describe('file search', () => {
        let messages: MessageInputItem[]
        beforeAll(() => {
          messages = [
            {
              id: 'fs_1234',
              type: 'file_search_call',
              status: 'in_progress',
              queries: ['query1', 'query2'],
              results: [
                {
                  attributes: { attribute1: 'value1' },
                  file_id: 'file_1234',
                  filename: 'file.txt',
                  score: 0.9,
                  text: 'Hello world!',
                },
              ],
            },
            {
              id: 'msg_1234',
              role: 'assistant',
              type: 'message',
              status: 'in_progress',
              content: [
                {
                  text: 'Hello world!',
                  type: 'output_text',
                  annotations: [
                    {
                      index: 0,
                      file_id: 'file_1234',
                      type: 'file_citation',
                    },
                  ],
                },
              ],
            },
          ]
        })

        it('handle request and response', async () => {
          expect(
            toPromptl({
              config: {},
              messages,
            }),
          ).toEqual({
            config: {},
            messages: [
              {
                id: 'fs_1234',
                role: 'assistant',
                status: 'in_progress',
                content: [
                  {
                    type: 'tool-call',
                    toolCallId: '1234',
                    toolName: 'file_search_call',
                    toolArguments: {
                      queries: ['query1', 'query2'],
                      results: [
                        {
                          attributes: { attribute1: 'value1' },
                          file_id: 'file_1234',
                          filename: 'file.txt',
                          score: 0.9,
                          text: 'Hello world!',
                        },
                      ],
                    },
                  },
                ],
              },
              {
                id: 'msg_1234',
                role: 'assistant',
                status: 'in_progress',
                content: [
                  {
                    type: 'tool-call',
                    toolCallId: '1234',
                    toolName: 'file_search_call',
                    toolArguments: {
                      text: 'Hello world!',
                      annotations: [
                        {
                          file_id: 'file_1234',
                          index: 0,
                          type: 'file_citation',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          })
        })
      })
    })
  })

  describe('#fromPromptl', () => {
    it('system', async () => {
      const prompt = `Hello world!`
      const { messages } = await render({
        prompt,
        adapter: Adapters.openaiResponses,
      })
      expect(messages).toEqual([
        {
          type: 'message',
          role: 'system',
          content: [{ text: 'Hello world!', type: 'input_text' }],
        },
      ])
    })

    it('developer', async () => {
      const prompt = removeCommonIndent(`
          <message role='developer'>
            Hello world!
          </message>
        `)
      const { messages } = await render({
        prompt,
        adapter: Adapters.openaiResponses,
      })
      expect(messages).toEqual([
        {
          type: 'message',
          role: 'developer',
          content: [{ text: 'Hello world!', type: 'input_text' }],
        },
      ])
    })

    it('assistant', async () => {
      const prompt = removeCommonIndent(`
          <assistant>
            Hello world!
          </assistant>
        `)
      const { messages } = await render({
        prompt,
        adapter: Adapters.openaiResponses,
      })
      expect(messages).toEqual([
        {
          type: 'message',
          role: 'assistant',
          content: [{ text: 'Hello world!', type: 'input_text' }],
        },
      ])
    })

    it('user', async () => {
      const prompt = removeCommonIndent(`
          <user>
            Hello world!
          </user>
        `)
      const { messages } = await render({
        prompt,
        adapter: Adapters.openaiResponses,
      })
      expect(messages).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [{ text: 'Hello world!', type: 'input_text' }],
        },
      ])
    })

    it('adapts user messages multi content', async () => {
      const prompt = removeCommonIndent(`
          <user name="Image master">
            Hello world!
            <content-image>https://image.source/</content-image>
            <content-file mime="text/plain">text content</content-file>
            <content-file mime="audio/wav">audio content</content-file>
          </user>
        `)

      const { messages } = await render({
        prompt,
        adapter: Adapters.openaiResponses,
      })
      expect(messages).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Hello world!' },
            {
              type: 'input_image',
              image_url: 'https://image.source/',
              detail: 'auto',
            },
            { type: 'input_file', file_data: 'text content' },
            { type: 'input_file', file_data: 'audio content' },
          ],
        },
      ])
    })

    it('assistant message with tool calls', async () => {
      const prompt = removeCommonIndent(`
      <assistant>
        Hello world!
        <tool-call id="1234" name="get_weather" arguments={{ { location: "Barcelona" } }} />
      </assistant>
      <assistant>
        List lotery winners
        <tool-call id="5678" name="get_lotery_winner" arguments={{ { location: "Madrid" } }} />
      </assistant>
    `)

      const { messages } = await render({
        prompt,
        adapter: Adapters.openaiResponses,
      })
      expect(messages).toEqual([
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'input_text', text: 'Hello world!' }],
        },
        {
          type: 'function_call',
          call_id: '1234',
          name: 'get_weather',
          arguments: JSON.stringify({ location: 'Barcelona' }),
        },
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'input_text', text: 'List lotery winners' }],
        },
        {
          type: 'function_call',
          call_id: '5678',
          name: 'get_lotery_winner',
          arguments: JSON.stringify({ location: 'Madrid' }),
        },
      ])
    })

    it('adapts tool messages', async () => {
      const prompt = removeCommonIndent(`
      <tool id="1234" name="temperature">
        { "temperature": "17ºC" }
      </tool>
    `)

      const { messages } = await render({
        prompt,
        adapter: Adapters.openaiResponses,
      })
      expect(messages).toEqual([
        {
          type: 'function_call_output',
          call_id: '1234',
          output: '{ "temperature": "17ºC" }',
          status: 'completed',
        },
      ])
    })
  })
})
