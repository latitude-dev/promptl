/**
 * OpenAI API reference for messages
 * Reference for https://api.openai.com/v1/responses
 * Source: https://platform.openai.com/docs/api-reference/responses
 */

import type {
  EasyInputMessage,
  ResponseCreateParamsBase,
  ResponseFunctionToolCall,
  ResponseInputContent,
  ResponseInputItem,
  ResponseOutputMessage as OpenAIResponseOutputMessage,
  ResponseOutputText as OpenAIResponseOutputText,
  ResponseOutputRefusal as OpenAIResponseOutputRefusal,
  ResponseReasoningItem as OpenAIResponseReasoningItem,
  ResponseFunctionWebSearch,
  ResponseFileSearchToolCall,
} from 'openai/resources/responses/responses'

export type MessageInputItem = ResponseInputItem
export type MessageRole = EasyInputMessage['role']
export type MessageContentSimple = ResponseInputContent
export type MessageContentInputItem = ResponseInputItem.Message['content']

// Output message
export type ResponseOutputMessage = OpenAIResponseOutputMessage
export type ResponseOutputText = OpenAIResponseOutputText
export type ResponseOutputRefusal = OpenAIResponseOutputRefusal

// Input Message
export type ResponseInputMessage = ResponseInputItem.Message

// Function Call
export type ToolCallRequest = ResponseFunctionToolCall
export type ToolCallResponse = ResponseInputItem.FunctionCallOutput

// Reasoning
export type ResponseReasoningItem = OpenAIResponseReasoningItem

// Simple Input
export type SimpleInputMessage = EasyInputMessage

// Web Search
export type WebSearchCall = ResponseFunctionWebSearch

// File Search
export type FileSearchCall = ResponseFileSearchToolCall

export type MessageContent =
  | EasyInputMessage['content']
  | ResponseInputItem.Message['content']
  | ResponseOutputMessage['content']
export type Message = ResponseCreateParamsBase['input']
