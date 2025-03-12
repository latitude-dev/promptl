import { ContentType, FileContent, ImageContent } from './message'

/**
 * Custom file type for PromptL.
 * It contains redundant information to make it easier to use.
 */
export type PromptLFile = {
  type: string
  mime: string
  mimeType: string

  isImage: boolean

  name: string

  size: number
  bytes: number

  url: string

  // Used to identify it
  __promptlType: 'file'
}

export function toPromptLFile({
  file,
  url,
}: {
  file: File | { type: string; size: number; name: string }
  url: string
}): PromptLFile {
  const mimeType = file.type
  const fileSize = file.size

  const isImage = mimeType.startsWith('image/')

  return {
    __promptlType: 'file',
    name: file.name,
    url,
    isImage,

    // Redundant type
    type: mimeType,
    mime: mimeType,
    mimeType: mimeType,

    // Redundant size
    size: fileSize,
    bytes: fileSize,
  }
}

export function isPromptLFile(value: unknown): value is PromptLFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__promptlType' in value &&
    (value as Record<string, unknown>).__promptlType === 'file'
  )
}

export function promptLFileToMessageContent(
  file: PromptLFile,
): FileContent | ImageContent {
  if (file.isImage) {
    return {
      type: ContentType.image,
      image: file.url,
    }
  }

  return {
    type: ContentType.file,
    mimeType: file.mimeType,
    file: file.url,
  }
}
