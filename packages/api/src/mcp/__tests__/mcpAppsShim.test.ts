import { synthesizeMCPAppsUiResource } from '../mcpAppsShim';
import type { MCPConnection } from '../connection';
import type * as t from '../types';

type ShimConnection = Partial<
  Pick<MCPConnection, 'getToolUiResourceUri' | 'readUiResourceContent'>
>;

function makeConnection(
  uiResourceUri: string | undefined,
  widget: Awaited<ReturnType<MCPConnection['readUiResourceContent']>>,
): ShimConnection {
  return {
    getToolUiResourceUri: jest.fn().mockReturnValue(uiResourceUri),
    readUiResourceContent: jest.fn().mockResolvedValue(widget),
  };
}

const HTML = '<!doctype html><html><body>widget</body></html>';

describe('synthesizeMCPAppsUiResource', () => {
  it('returns undefined result unchanged', async () => {
    const conn = makeConnection('ui://x', { text: HTML, mimeType: 'text/html' });
    const out = await synthesizeMCPAppsUiResource(undefined, 'anything', conn);
    expect(out).toBeUndefined();
  });

  it('appends a resource content part when the tool declares a ui:// widget', async () => {
    const conn = makeConnection('ui://cbioportal/pie', {
      text: HTML,
      mimeType: 'text/html',
    });
    const response: t.MCPToolCallResponse = {
      content: [{ type: 'text', text: '{"total":30}' }],
      isError: false,
    };

    const out = await synthesizeMCPAppsUiResource(response, 'pie_chart', conn);

    expect(conn.getToolUiResourceUri).toHaveBeenCalledWith('pie_chart');
    expect(conn.readUiResourceContent).toHaveBeenCalledWith('ui://cbioportal/pie');
    expect(out?.content).toHaveLength(2);
    expect(out?.content?.[1]).toEqual({
      type: 'resource',
      resource: {
        uri: 'ui://cbioportal/pie',
        mimeType: 'text/html',
        text: HTML,
      },
    });
    // Original content untouched — no in-place mutation.
    expect(out?.content?.[0]).toBe(response.content?.[0]);
    expect(response.content).toHaveLength(1);
  });

  it('defaults mimeType to text/html when the resource server omits it', async () => {
    const conn = makeConnection('ui://x/widget', { text: HTML });
    const out = await synthesizeMCPAppsUiResource(
      { content: [], isError: false },
      'widget_tool',
      conn,
    );
    expect(out?.content?.[0]).toMatchObject({
      type: 'resource',
      resource: { mimeType: 'text/html' },
    });
  });

  it('passes response through untouched when the tool has no declared ui:// URI', async () => {
    const conn = makeConnection(undefined, { text: HTML });
    const response: t.MCPToolCallResponse = {
      content: [{ type: 'text', text: 'plain' }],
    };
    const out = await synthesizeMCPAppsUiResource(response, 'not_a_widget', conn);
    expect(out).toBe(response);
    expect(conn.readUiResourceContent).not.toHaveBeenCalled();
  });

  it('does not double-append when the server already emitted a matching resource part', async () => {
    const conn = makeConnection('ui://cbioportal/pie', {
      text: HTML,
      mimeType: 'text/html',
    });
    const response: t.MCPToolCallResponse = {
      content: [
        { type: 'text', text: '{"total":30}' },
        {
          type: 'resource',
          resource: { uri: 'ui://cbioportal/pie', mimeType: 'text/html', text: HTML },
        },
      ],
      isError: false,
    };

    const out = await synthesizeMCPAppsUiResource(response, 'pie_chart', conn);

    expect(out).toBe(response);
    expect(conn.readUiResourceContent).not.toHaveBeenCalled();
  });

  it('re-appends when an existing resource part has a different ui:// URI (belongs to a different widget)', async () => {
    const conn = makeConnection('ui://cbioportal/pie', {
      text: HTML,
      mimeType: 'text/html',
    });
    const response: t.MCPToolCallResponse = {
      content: [
        {
          type: 'resource',
          resource: {
            uri: 'ui://cbioportal/oncoprint',
            mimeType: 'text/html',
            text: '<other-widget/>',
          },
        },
      ],
      isError: false,
    };

    const out = await synthesizeMCPAppsUiResource(response, 'pie_chart', conn);
    expect(out?.content).toHaveLength(2);
    expect((out?.content?.[1] as { resource: { uri: string } }).resource.uri).toBe(
      'ui://cbioportal/pie',
    );
  });

  it('passes through when the widget resource fetch returns null', async () => {
    const conn = makeConnection('ui://x', null);
    const response: t.MCPToolCallResponse = { content: [{ type: 'text', text: 'x' }] };
    const out = await synthesizeMCPAppsUiResource(response, 'widget_tool', conn);
    expect(out).toBe(response);
  });

  it('passes through when the widget body has no text', async () => {
    const conn = makeConnection('ui://x', { mimeType: 'text/html' });
    const response: t.MCPToolCallResponse = { content: [] };
    const out = await synthesizeMCPAppsUiResource(response, 'widget_tool', conn);
    expect(out).toBe(response);
  });

  it('tolerates connections that do not implement the MCP-Apps helpers', async () => {
    const response: t.MCPToolCallResponse = { content: [{ type: 'text', text: 'x' }] };
    // Empty object simulates a minimal test/mock connection.
    const out = await synthesizeMCPAppsUiResource(response, 'any_tool', {});
    expect(out).toBe(response);
  });
});
