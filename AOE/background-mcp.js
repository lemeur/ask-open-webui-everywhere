// background-mcp.js - MCP WebSocket
const SESSION_KEY = 'extension_mcp_session';

async function getOpenWebUIBaseUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      { savedTargetUrl: 'http://localhost:3000' },
      data => resolve(data.savedTargetUrl)
    );
  });
}

async function setupMCP() {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'mcp_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  const baseUrl = await getOpenWebUIBaseUrl();
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const wsUrl = `${wsBase}/plugins/extension-mcp-bridge/ws/${sessionId}`;
  
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('✅ MCP WebSocket OK:', wsUrl);
    chrome.action.setBadgeText({text: 'MCP'});
  };
  
  ws.onerror = e => console.error('❌ MCP WS:', e);
  
  ws.onmessage = async event => {
    const { type, tool, args } = JSON.parse(event.data);
    if (type === 'mcp_tool_call') {
      const result = await handleTool(tool, args);
      ws.send(JSON.stringify({type: 'mcp_result', result}));
    }
  };
}

async function handleTool(tool, args) {
  try {
    switch(tool) {
      case 'screenshot_current':
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        const img = await chrome.tabs.captureVisibleTab(tab.windowId, {format: 'png'});
        return {type: 'image/png', data: img, width: tab.width, height: tab.height};
        
      case 'text_current':
        const [activeTab] = await chrome.tabs.query({active: true});
        return await new Promise(r => {
          chrome.tabs.sendMessage(activeTab.id, {action: 'get_page_text'}, 
            t => r({text: t || 'No text'}));
        });
        
      case 'tabs_list':
        const tabs = await chrome.tabs.query({});
        return tabs.map(t => ({
          id: t.id, title: t.title, url: t.url, 
          favicon: t.favIconUrl, active: t.active
        }));
        
      case 'filesystem_read':
        const [handle] = await window.showOpenFilePicker({
          suggestedName: args.suggestedName || 'document.txt'
        });
        const file = await handle.getFile();
        return {
          name: file.name, size: file.size,
          mime: file.type,
          content: await file.text()
        };
    }
  } catch(e) {
    return {error: e.message};
  }
}

// Auto-démarrage
chrome.runtime.onInstalled.addListener(setupMCP);
chrome.runtime.onStartup.addListener(setupMCP);
chrome.storage.onChanged.addListener(setupMCP); // Reload si options changées
