import { RESERVED_TAGS } from "$promptl/constants";

export const RESERVED_TAG_REGEX = new RegExp(`^</?(${RESERVED_TAGS.join('|')})(\\s|/?>|$)`)