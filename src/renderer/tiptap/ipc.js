let attached=false
export function attachTiptapIpc(editor){
  if(attached) return
  if(!window.electronAPI) return
  attached=true
  window.electronAPI.onEditorTextRequest(({requestId})=>{
    const text=(editor&&typeof editor.getText==='function')?editor.getText():''
    window.electronAPI.sendEditorTextResponse(requestId,text)
  })
}
