import {
  AssistantMessage,
  Config,
  ContentType,
  Conversation,
  Message,
  MessageContent,
} from '$promptl/types'
import { expect } from 'vitest'

import { Chain } from '../chain'

export async function getExpectedError<T>(
  action: () => Promise<unknown>,
  errorClass: new () => T,
): Promise<T> {
  try {
    await action()
  } catch (err) {
    expect(err).toBeInstanceOf(errorClass)
    return err as T
  }
  throw new Error('Expected an error to be thrown')
}

export async function complete({
  chain,
  callback,
  maxSteps = 50,
}: {
  chain: Chain
  callback?: (convo: Conversation) => Promise<string>
  maxSteps?: number
}): Promise<{
  response: MessageContent[]
  messages: Message[]
  config: Config
  steps: number
}> {
  let steps = 0

  let responseMessage: Omit<AssistantMessage, 'role'> | undefined
  while (true) {
    const { completed, messages, config } =
      await chain.step(responseMessage)

    if (completed)
      return {
        messages,
        config,
        steps,
        response: responseMessage!.content as MessageContent[],
      }

    const response = callback ? await callback({ messages, config }) : 'RESPONSE'
    responseMessage = { content: [{ type: ContentType.text, text: response }] }
    steps++

    if (steps > maxSteps) throw new Error('too many chain steps')
  }
}
