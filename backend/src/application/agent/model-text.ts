/**
 * Extract the final user-facing message from a raw model completion, tolerating
 * the various shapes Nova/Bedrock can emit: <thinking> noise, <response> blocks,
 * `respond` tool markup (message="..."), embedded JSON, or plain text.
 */
export function extractUserFacingText(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '').trim();

  const responseBlock = text.match(/<response\b[^>]*>([\s\S]*?)<\/response>/i);
  if (responseBlock?.[1] !== undefined) text = responseBlock[1].trim();

  const respondMessage = text.match(/\bmessage\s*=\s*"((?:\\.|[^"\\])*)"/i);
  if (respondMessage?.[1] !== undefined) {
    try {
      return (JSON.parse(`"${respondMessage[1]}"`) as string).trim();
    } catch {
      return respondMessage[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as { message?: unknown };
      if (typeof parsed.message === 'string') return parsed.message.trim();
    } catch {
      /* fall back to plain text below */
    }
  }

  return text
    .replace(/<\/?(?:response|respond)\b[^>]*>/gi, '')
    .replace(/^Responding to the user[^.]*\.?\s*/i, '')
    .trim();
}
