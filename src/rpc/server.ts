import procedures from './procedures'
import { RPC } from './types'

const enum Fd {
  StdIn = 0,
  StdOut = 1,
  StdErr = 2,
}

const CHUNK_SIZE = 1024

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

  return JSON.parse(new TextDecoder().decode(calls).trim())
}

function send(results: RPC.Result<any>[]) {
  const payload = new TextEncoder().encode(JSON.stringify(results) + '\n')

  Javy.IO.writeSync(Fd.StdOut, payload)
}

async function execute(calls: RPC.Call<any>[]): Promise<RPC.Result<any>[]> {
  const results: RPC.Result<any>[] = []

  for (const call of calls) {
    const handler = procedures[call.procedure]
    if (!handler) {
      results.push({
        error: {
          code: RPC.ErrorCode.UnknownProcedure,
          message: `Unknown RPC procedure: ${call.procedure}`,
        },
      })
      continue
    }

    try {
      results.push({
        value: await handler(call.parameters),
      })
    } catch (error) {
      results.push({
        error: {
          code: RPC.ErrorCode.ProcedureError,
          message: error instanceof Error ? error.message : String(error),
          details: error as any,
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
  } catch (error) {
    send([
      {
        error: {
          code: RPC.ErrorCode.ReceiveError,
          message: `Failed to unmarshal RPC calls: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
    ])
    return
  }

  execute(calls)
    .then((results) => {
      try {
        send(results)
      } catch (error) {
        send([
          {
            error: {
              code: RPC.ErrorCode.SendError,
              message: `Failed to marshal RPC results: ${error instanceof Error ? error.message : String(error)}`,
            },
          },
        ])
      }
    })
    .catch((error) => {
      send([
        {
          error: {
            code: RPC.ErrorCode.ExecuteError,
            message: `Failed to execute RPC calls: ${error instanceof Error ? error.message : String(error)}`,
          },
        },
      ])
    })
}
