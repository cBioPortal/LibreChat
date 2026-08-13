import { logger } from '@librechat/data-schemas';
import type { MCPConnection } from './connection';
import type * as t from './types';

/**
 * Bridge between two flavors of the MCP `io.modelcontextprotocol/ui`
 * ("MCP Apps") extension.
 *
 * The current @mcp-ui/client renderer LibreChat ships expects the widget to
 * arrive as an *embedded* `resource` content part inside the tool response —
 * one whose `resource.uri` starts with `ui://` and whose `text` holds the
 * inline widget HTML. That's what {@link ./parsers#formatToolContent} scans
 * for when it lifts UI resources into attachments.
 *
 * FastMCP's implementation (>=3.3.1) instead attaches the widget URI to the
 * *tool declaration* via `_meta.ui.resourceUri` and returns tool responses
 * with only the structured payload — no `resource` content part. Without this
 * shim, LibreChat would parse those responses as plain data and never render
 * a widget.
 *
 * This function looks up the tool's declared `ui://` URI on the connection
 * (populated by {@link MCPConnection.fetchTools}), reads the widget body via
 * MCP `resources/read`, and appends a synthetic `resource` content part to
 * the response so the existing parser path lights up unchanged. The original
 * response is returned as-is when:
 *
 *   - the tool has no declared ui:// URI (not a widget tool);
 *   - the response already contains a matching `resource` part (server sent
 *     both signals or is the LibreChat-native flavor);
 *   - `resources/read` fails (network / capability mismatch) — logged as a
 *     debug line, not surfaced to the caller, since the tool call itself
 *     succeeded and its payload is still useful to the model.
 */
export async function synthesizeMCPAppsUiResource(
  result: t.MCPToolCallResponse,
  toolName: string,
  connection: Partial<Pick<MCPConnection, 'getToolUiResourceUri' | 'readUiResourceContent'>>,
): Promise<t.MCPToolCallResponse> {
  if (!result) {
    return result;
  }
  /**
   * Tolerate connection shims (older mocks, non-standard drivers) that don't
   * implement the MCP-Apps helpers — treat them as "no widget declared" so
   * this shim never breaks the normal tool-call path.
   */
  if (
    typeof connection.getToolUiResourceUri !== 'function' ||
    typeof connection.readUiResourceContent !== 'function'
  ) {
    return result;
  }
  const uiResourceUri = connection.getToolUiResourceUri(toolName);
  if (!uiResourceUri) {
    return result;
  }

  const existingContent = result.content ?? [];
  const alreadyHasWidget = existingContent.some(
    (part) =>
      part.type === 'resource' &&
      typeof (part as { resource?: { uri?: unknown } }).resource?.uri === 'string' &&
      (part as { resource: { uri: string } }).resource.uri === uiResourceUri,
  );
  if (alreadyHasWidget) {
    return result;
  }

  const widget = await connection.readUiResourceContent(uiResourceUri);
  if (!widget || widget.text == null) {
    logger.debug(
      `[MCP][${toolName}] widget resource ${uiResourceUri} could not be read; response passed through unchanged`,
    );
    return result;
  }

  const resourcePart: t.ToolContentPart = {
    type: 'resource',
    resource: {
      uri: uiResourceUri,
      mimeType: widget.mimeType ?? 'text/html',
      text: widget.text,
    },
  };

  return {
    ...result,
    content: [...existingContent, resourcePart],
  };
}
