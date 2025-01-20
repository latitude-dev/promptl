// Run `pnpm build:rpc` before running this example

import { FileHandle, mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WASI } from 'node:wasi'

const result = await execute('./dist/promptl.wasm', [
  {
    id: 1,
    procedure: 'scan',
    parameters: {
      prompt: `Hello world!`,
    },
  },
  {
    id: 2,
    procedure: 'compile',
    parameters: {
      prompt: 'Hello {{ name }}!',
      parameters: {
        name: 'Alex',
      },
    },
  },
])

console.log(JSON.stringify(result, null, 2))

// Utility functions

async function execute(wasm: string, data: any): Promise<any> {
  const dir = tmpdir()
  const stdin_path = join(dir, `stdin`)
  const stdout_path = join(dir, `stdout`)
  const stderr_path = join(dir, `stderr`)

  await mkdir(dir, { recursive: true })
  await writeFile(stdin_path, '')
  await writeFile(stdout_path, '')
  await writeFile(stderr_path, '')

  let stdin: FileHandle | undefined
  let stdout: FileHandle | undefined
  let stderr: FileHandle | undefined

  let wasmStdin: FileHandle | undefined
  let wasmStdout: FileHandle | undefined
  let wasmStderr: FileHandle | undefined

  try {
    stdin = await open(stdin_path, 'w')
    stdout = await open(stdout_path, 'r')
    stderr = await open(stderr_path, 'r')

    wasmStdin = await open(stdin_path, 'r')
    wasmStdout = await open(stdout_path, 'w')
    wasmStderr = await open(stderr_path, 'w')

    const wasi = new WASI({
      version: 'preview1',
      args: [],
      env: {},
      stdin: wasmStdin.fd,
      stdout: wasmStdout.fd,
      stderr: wasmStderr.fd,
      returnOnExit: true,
    })

    const bytes = await readFile(wasm)
    WebAssembly.validate(bytes)
    const module = await WebAssembly.compile(bytes)
    const instance = await WebAssembly.instantiate(
      module,
      wasi.getImportObject(),
    )

    await send(stdin, data)

    wasi.start(instance)

    const [out, err] = await Promise.all([receive(stdout), receive(stderr)])
    if (err) throw new Error(err)

    return out
  } finally {
    await Promise.all([
      stdin?.close(),
      stdout?.close(),
      stderr?.close(),
      wasmStdin?.close(),
      wasmStdout?.close(),
      wasmStderr?.close(),
    ])
  }
}

async function send(file: FileHandle, data: any) {
  await writeFile(file, JSON.stringify(data), { encoding: 'utf8' })
}

async function receive(file: FileHandle): Promise<any> {
  const data = (await readFile(file, 'utf8')).trim()

  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}
