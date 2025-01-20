// Run `pnpm build:lib` before running this example

import assert from 'node:assert'
import { inspect } from 'node:util'
import { Chain } from '../dist/index.js'

const prompt = `
<step>
  <system>
    You are a helpful assistant.
  </system>
  <user>
    Say hello.
  </user>
</step>
<step>
  <user>
    Now say goodbye.
  </user>
</step>
`

const chain = new Chain({ prompt })
let conversation = await chain.step()
conversation = await chain.step('Hello!')
conversation = await chain.step('Goodbye!')

assert(chain.completed)
assert(conversation.completed)

console.log(inspect(conversation.messages, { depth: null }))
