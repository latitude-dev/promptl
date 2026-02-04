import { ContentTypeTagName } from './types'

export const CUSTOM_TAG_START = '{{'
export const CUSTOM_TAG_END = '}}'

export enum TAG_NAMES {
  message = 'message',
  system = 'system',
  developer = 'developer',
  user = 'user',
  assistant = 'assistant',
  tool = 'tool',
  content = 'content',
  text = ContentTypeTagName.text,
  image = ContentTypeTagName.image,
  file = ContentTypeTagName.file,
  toolCall = ContentTypeTagName.toolCall,
  prompt = 'prompt',
  scope = 'scope',
  step = 'step',
}

export const CUSTOM_MESSAGE_ROLE_ATTR = 'role' as const
export const CUSTOM_CONTENT_TYPE_ATTR = 'type' as const
export const REFERENCE_PATH_ATTR = 'path' as const
export const REFERENCE_DEPTH_LIMIT = 50
export const CHAIN_STEP_ISOLATED_ATTR = 'isolated' as const

export enum KEYWORDS {
  if = 'if',
  endif = 'endif',
  else = 'else',
  for = 'for',
  endfor = 'endfor',
  as = 'as',
  in = 'in',
  true = 'true',
  false = 'false',
  null = 'null',
}

export const RESERVED_KEYWORDS = Object.values(KEYWORDS)
export const RESERVED_TAGS = Object.values(TAG_NAMES)
export const SPECIAL_IDENTIFIERS = new Set(['$now'])

export const SPECIAL_RESOLVERS: Record<string, () => unknown> = {
  $now: () => new Date(),
}
