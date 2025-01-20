declare global {
  const Javy: {
    IO: {
      readSync: (fd: number, buffer: Uint8Array) => number
      writeSync: (fd: number, buffer: Uint8Array) => void
    }
  }
}

export namespace RPC {
  export const enum Procedure {
    ScanPrompt = 'scanPrompt',
    CreateChain = 'createChain',
    StepChain = 'stepChain',
  }

  export type Call<Parameters> = {
    id: number
    procedure: Procedure
    parameters: Parameters
  }

  export const enum ErrorCode {
    ReceiveError = 'RECEIVE_ERROR',
    ExecuteError = 'EXECUTE_ERROR',
    SendError = 'SEND_ERROR',
    ProcedureError = 'PROCEDURE_ERROR',
    UnknownProcedure = 'UNKNOWN_PROCEDURE',
    UnknownError = 'UNKNOWN_ERROR',
  }

  export type Error = {
    code: ErrorCode
    message: string
    details?: Record<string, any>
  }

  export type Result<Value> = {
    id: number
    value?: Value
    error?: Error
  }

  // Errors are thrown in order to pass them
  export type Handler<Parameters, Value> = (parameters: Parameters) => Value
}
