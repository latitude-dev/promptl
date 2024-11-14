import { TAG_NAMES } from '$promptl/constants'
import { ContentTypeTagName, MessageRole } from '$promptl/types'
import { Identifier, type Node as LogicalExpression } from 'estree'

export type BaseNode = {
  start: number | null
  end: number | null
  type: string
  children?: TemplateNode[]
  [propName: string]: any
}

export type Fragment = BaseNode & {
  type: 'Fragment'
  children: TemplateNode[]
}

export type Config = BaseNode & {
  type: 'Config'
  value: string
}

export type Text = BaseNode & {
  type: 'Text'
  data: string
}

export type Attribute = BaseNode & {
  type: 'Attribute'
  name: string
  value: TemplateNode[] | true
}

type IElementTag<T extends string> = BaseNode & {
  type: 'ElementTag'
  name: T
  attributes: Attribute[]
  children: TemplateNode[]
}

export type MessageTag =
  | IElementTag<MessageRole>
  | IElementTag<typeof TAG_NAMES.message>
export type ContentTag =
  | IElementTag<ContentTypeTagName>
  | IElementTag<typeof TAG_NAMES.content>

export type ReferenceTag = IElementTag<typeof TAG_NAMES.prompt>
export type ChainStepTag = IElementTag<typeof TAG_NAMES.step>
export type ElementTag =
  | ContentTag
  | MessageTag
  | ReferenceTag
  | IElementTag<string>

export type MustacheTag = BaseNode & {
  type: 'MustacheTag'
  expression: LogicalExpression
}

export type Comment = BaseNode & {
  type: 'Comment'
  data: string
}

export type ElseBlock = BaseNode & {
  type: 'ElseBlock'
}

export type IfBlock = BaseNode & {
  type: 'IfBlock'
  expression: LogicalExpression
  else: ElseBlock | null
}

export type ForBlock = BaseNode & {
  type: 'ForBlock'
  expression: LogicalExpression
  context: Identifier
  index: Identifier | null
  else: ElseBlock | null
}

export type TemplateNode =
  | Fragment
  | Config
  | Text
  | ElementTag
  | MustacheTag
  | Comment
  | IfBlock
  | ForBlock
