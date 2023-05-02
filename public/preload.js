const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
    init: () => ipcRenderer.invoke('INIT'),
    openDirectory: (directory, currentDirectory) => ipcRenderer.invoke('OPEN_DIRECTORY', directory, currentDirectory),
    getImageData: (filePath) => ipcRenderer.invoke('GET_IMAGE_DATA', filePath),
    loadFile: (file) => ipcRenderer.invoke('LOAD_FILE', file),
    transcribe: (buffer, filePath) => ipcRenderer.invoke('TRANSCRIBE', buffer, filePath),
    saveExif: (filePath, changedTags) => ipcRenderer.invoke('SAVE_EXIF', filePath, changedTags),
    updateSetting: (key, value) => ipcRenderer.send('UPDATE_SETTING', key, value),
    openFile: (filePath) => ipcRenderer.send('OPEN_FILE', filePath),
    eraseRecordings: () => ipcRenderer.invoke('ERASE_RECORDINGS'),
    chooseFile: () => ipcRenderer.invoke('CHOOSE_FILE'),
    toggleFavorite: (directory) => ipcRenderer.invoke('TOGGLE_FAVORITE', directory),
});
