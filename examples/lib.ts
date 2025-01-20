// Run `pnpm build:lib` before running this example

import { Chain } from '../dist/index.js'

const prompt = `
  <user>
    Hello world!
  </user>
`

const chain = new Chain({ prompt })
const step = await chain.step()

console.log(step)
