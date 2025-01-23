import procedures from './procedures'
import { RPC } from './types'

const enum Fd {
  StdIn = 0,
  StdOut = 1,
  StdErr = 2,
}

const CHUNK_SIZE = 1024

const decoder = new TextDecoder()
const encoder = new TextEncoder()

function receive(): RPC.Call<any>[] {
  const chunks = []
  let size = 0

  while (true) {
    const chunk = new Uint8Array(CHUNK_SIZE)

    const bytes = Javy.IO.readSync(Fd.StdIn, chunk)
    if (bytes === 0) {
      break
    }

    size += bytes
    chunks.push(chunk.subarray(0, bytes))
  }

  const { calls } = chunks.reduce(
    ({ offset, calls }, chunk) => {
      calls.set(chunk, offset)
      offset += chunk.length

      return { offset, calls }
    },
    { offset: 0, calls: new Uint8Array(size) },
  )

  const payload = JSON.parse(decoder.decode(calls).trim())

  return payload
}

function jsonReplacer(_key: string, value: any): any {
  if (value instanceof Error) {
    const error: Record<string, any> = {}

    for (const name of Object.getOwnPropertyNames(value)) {
      const property = (value as any)[name]

      if (property instanceof Error) {
        error[name] = jsonReplacer(name, property)
      } else {
        error[name] = property
      }
    }

    return error
  }

  return value
}

function send(results: RPC.Result<any>[]) {
  const payload = encoder.encode(JSON.stringify(results, jsonReplacer) + '\n')

  Javy.IO.writeSync(Fd.StdOut, payload)
}

async function execute(calls: RPC.Call<any>[]): Promise<RPC.Result<any>[]> {
  const results: RPC.Result<any>[] = []

  for (const call of calls) {
    const handler = procedures[call.procedure]
    if (!handler) {
      results.push({
        error: {
          code: RPC.ErrorCode.ExecuteError,
          message: `Unknown RPC procedure: ${call.procedure}`,
        },
      })
      continue
    }

    try {
      results.push({
        value: await handler(call.parameters),
      })
    } catch (error: any) {
      results.push({
        error: {
          code: RPC.ErrorCode.ExecuteError,
          message: `Failed to execute RPC procedure: ${call.procedure}: ${error.message || String(error)}`,
          details: error,
        },
      })
    }
  }

  return results
}

export function serve() {
  let calls: RPC.Call<any>[]

  try {
    calls = receive()
  } catch (error: any) {
    send([
      {
        error: {
          code: RPC.ErrorCode.ReceiveError,
          message: `Failed to unmarshal RPC calls: ${error.message || String(error)}`,
        },
      },
    ])
    return
  }

  execute(calls)
    .then((results) => {
      try {
        send(results)
      } catch (error: any) {
        send([
          {
            error: {
              code: RPC.ErrorCode.SendError,
              message: `Failed to marshal RPC results: ${error.message || String(error)}`,
            },
          },
        ])
      }
    })
    .catch((error: any) => {
      send([
        {
          error: {
            code: RPC.ErrorCode.ExecuteError,
            message: `Failed to execute RPC procedures: ${error.message || String(error)}`,
          },
        },
      ])
    })
}
