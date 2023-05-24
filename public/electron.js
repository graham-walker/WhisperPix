const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const isDev = require('electron-is-dev');
const sharp = require('sharp');
const commandExistsSync = require('command-exists').sync;
const spawn = require('await-spawn');
const Store = require('electron-store');
const { version } = require('../package.json');
const os = require('os');
const exiftool = require('exiftool-vendored').exiftool;
const crypto = require('crypto');

sharp.cache({ files: 0 }); // Fixes WebP files getting locked and being unable to write EXIF metadata

const title = 'WhisperPix';
const repoUrl = 'https://github.com/graham-walker/WhisperPix';

const dataDir = app.getPath('userData');
const recordingsDir = path.join(dataDir, 'WhisperPix Recordings');
const recordingsFile = path.join(recordingsDir, 'Recordings List.txt');
const cacheDir = path.join(dataDir, 'WhisperPix Cache');

const embeddedFfmpegPath = path.join(__dirname, process.platform === 'win32'
    ? '/bin/win32/ffmpeg-n6.0-latest-win64-lgpl-6.0/bin/ffmpeg'
    : '/bin/linux/ffmpeg-n6.0-latest-linux64-lgpl-6.0/bin/ffmpeg'
).replace('app.asar' + path.sep + 'build', 'app.asar.unpacked' + path.sep + 'public');
const embeddedModelPath = path.join(__dirname, '/bin/shared/whisper.cpp-1.2.1/models/ggml-tiny.bin')
    .replace('app.asar' + path.sep + 'build', 'app.asar.unpacked' + path.sep + 'public');

app.commandLine.appendSwitch('disable-pinch'); // Disable pinch zoom

const modelsAvailable = [
    'tiny.en|Tiny English (1GB VRAM)',
    'tiny|Tiny Multilingual (1GB VRAM)',
    'base.en|Base English (1GB VRAM)',
    'base|Base Multilingual (1GB VRAM)',
    'small.en|Small English (2GB VRAM)',
    'small|Small Multilingual (2GB VRAM)',
    'medium.en|Medium English (5GB VRAM)',
    'medium|Medium Multilingual (5GB VRAM)',
    'large|Large Multilingual (10GB VRAM)',
    'large-v1|Large Multilingual v1 (10GB VRAM)',
    'large-v2|Large Multilingual v2 (10GB VRAM)',
];
const languagesAvailable = [
    "auto|Auto Detect",
    "en|English",
    "zh|Chinese",
    "de|German",
    "es|Spanish",
    "ru|Russian",
    "ko|Korean",
    "fr|French",
    "ja|Japanese",
    "pt|Portuguese",
    "tr|Turkish",
    "pl|Polish",
    "ca|Catalan",
    "nl|Dutch",
    "ar|Arabic",
    "sv|Swedish",
    "it|Italian",
    "id|Indonesian",
    "hi|Hindi",
    "fi|Finnish",
    "vi|Vietnamese",
    "iw|Hebrew",
    "uk|Ukrainian",
    "el|Greek",
    "ms|Malay",
    "cs|Czech",
    "ro|Romanian",
    "da|Danish",
    "hu|Hungarian",
    "ta|Tamil",
    "no|Norwegian",
    "th|Thai",
    "ur|Urdu",
    "hr|Croatian",
    "bg|Bulgarian",
    "lt|Lithuanian",
    "la|Latin",
    "mi|Maori",
    "ml|Malayalam",
    "cy|Welsh",
    "sk|Slovak",
    "te|Telugu",
    "fa|Persian",
    "lv|Latvian",
    "bn|Bengali",
    "sr|Serbian",
    "az|Azerbaijani",
    "sl|Slovenian",
    "kn|Kannada",
    "et|Estonian",
    "mk|Macedonian",
    "br|Breton",
    "eu|Basque",
    "is|Icelandic",
    "hy|Armenian",
    "ne|Nepali",
    "mn|Mongolian",
    "bs|Bosnian",
    "kk|Kazakh",
    "sq|Albanian",
    "sw|Swahili",
    "gl|Galician",
    "mr|Marathi",
    "pa|Punjabi",
    "si|Sinhala",
    "km|Khmer",
    "sn|Shona",
    "yo|Yoruba",
    "so|Somali",
    "af|Afrikaans",
    "oc|Occitan",
    "ka|Georgian",
    "be|Belarusian",
    "tg|Tajik",
    "sd|Sindhi",
    "gu|Gujarati",
    "am|Amharic",
    "yi|Yiddish",
    "lo|Lao",
    "uz|Uzbek",
    "fo|Faroese",
    "ht|Haitiancreole",
    "ps|Pashto",
    "tk|Turkmen",
    "nn|Nynorsk",
    "mt|Maltese",
    "sa|Sanskrit",
    "lb|Luxembourgish",
    "my|Myanmar",
    "bo|Tibetan",
    "tl|Tagalog",
    "mg|Malagasy",
    "as|Assamese",
    "tt|Tatar",
    "haw|Hawaiian",
    "ln|Lingala",
    "ha|Hausa",
    "ba|Bashkir",
    "jw|Javanese",
    "su|Sundanese",
];
const commentTagsAvailable = ['Comment', 'XPComment', 'UserComment', 'Description', 'ImageDescription', 'Caption'];
const keywordsTagsAvailable = ['Keywords', 'XPKeywords', 'Subject', 'XPSubject'];
const tagsAvailable = ['Artist', 'Copyright', 'Creator', 'Location', 'Title', 'XPAuthor', 'XPTitle'];

const schema = { // *Setting can only be changed by directly editing config.json
    recordingsBytes: { type: 'number', default: 0, minimum: 0 },
    thumbnailBaseSize: { type: 'number', default: 104, minimum: 32 }, // *
    audioCodec: { type: 'string', default: 'audio/wav' },
    recentDirectories: { type: 'array', default: [], items: { type: 'string' } },
    maxRecentDirectories: { type: 'number', default: 100, minimum: 0 }, // *
    favoritedDirectories: { type: 'number', default: 0 },
    recentKeywords: { type: 'array', default: [], items: { type: 'string' } },
    maxRecentKeywords: { type: 'number', default: 100, minimum: 0 }, // *
    openaiModel: { type: 'string', default: 'tiny' },
    cppModel: { type: 'string', default: '' }, // If blank uses the embedded model
    modelsAvailable: { type: 'array', default: modelsAvailable, items: { type: 'string' } }, // *
    commentTag: { type: 'string', default: process.platform === 'win32' ? 'XPComment' : 'Description' },
    commentTagsAvailable: { type: 'array', default: commentTagsAvailable, items: { type: 'string' } }, // *
    keywordsTag: { type: 'string', default: process.platform === 'win32' ? 'XPKeywords' : 'Keywords' },
    keywordsTagsAvailable: { type: 'array', default: keywordsTagsAvailable, items: { type: 'string' } }, // *
    tagsEnabled: { type: 'array', default: ['Artist', 'Copyright', 'Creator', 'Location', 'Title'], items: { type: 'string' } },
    tagsAvailable: { type: 'array', default: tagsAvailable, items: { type: 'string' } }, // *
    seenSpeedWarning: { type: 'boolean', default: false },
    language: { type: 'string', default: 'en' },
    languagesAvailable: { type: 'array', default: languagesAvailable, items: { type: 'string' } }, // *
    useEmbeddedFfmpeg: { type: 'boolean', default: true },
    useEmbeddedWhisper: { type: 'boolean', default: true },
    spawn: { type: 'string', default: 'whisper' },
    thumbnailsPreviewsEnabled: { type: 'string', default: 'both' },
    seenVersion: { type: 'string', default: version },
    addMetadataToComment: { type: 'boolean', default: true }, // *
}

let win;
let store;
let settings;
let thumbnailSize;

// Only allow one instance of the app at a time
const lock = app.requestSingleInstanceLock();
if (!lock) {
    exiftool.end();
    app.quit();
    return;
} else {
    app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
        }
    });
}

const createWindow = () => {
    readConfig();

    win = new BrowserWindow({
        title,
        width: 800,
        height: 600,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: isDev
                ? path.join(app.getAppPath(), './public/preload.js')
                : path.join(app.getAppPath(), './build/preload.js'),
            spellcheck: false
        }
    });

    win.loadURL(isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../build/index.html')}`
    );

    win.setMenuBarVisibility(false);

    if (isDev) {
        win.setIcon(path.join(__dirname, 'WhisperPix_icon512x512.png'));

        win.webContents.on('did-frame-finish-load', () => {
            win.webContents.openDevTools({ mode: 'detach' });
        });
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // Quit when all windows are closed, except on macOS (app should be explicitly with Cmd + Q)
    if (process.platform !== 'darwin') {
        exiftool.end();
        app.quit();
    }
});

app.on('activate', () => {
    // Recreate the windoww on macOS when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Communicate with render process
ipcMain.handle('INIT', async () => {
    return {
        ...store.store,
        sep: path.sep,
        version,
        repoUrl,
        recordingsDir,
        platform: process.platform,
    };
});

ipcMain.handle('OPEN_DIRECTORY', async (e, directory, currentDirectory) => {
    try {
        if (!directory) directory = dialog.showOpenDialogSync(win, { properties: ['openDirectory'] });
        if (!directory) return;
        if (typeof directory === 'object') directory = directory[0];

        try {
            directory = fs.realpathSync.native(directory); // Get the actual directory name (this also normalizes)
        } catch (err) {
            directory = path.normalize(directory);
        }

        if (directory === currentDirectory) return;

        let files = fs.readdirSync(directory, { withFileTypes: true }).map(file => {
            return {
                name: file.name,
                path: path.join(directory, file.name),
                ext: path.extname(file.name),
                file: file.isFile(),
                directory: file.isDirectory(),
                thumbnail: null,
                comment: '',
                keywords: '',
                invalid: false,
                loaded: file.isDirectory(), // Directories default is loaded = true
                metadata: {},
                parsed: {},
            }
        });

        files.sort((a, b) => b.directory - a.directory || a.name.localeCompare(b.name, undefined, { numeric: true })); // Alphabetical with directories first 

        updateSetting('recentDirectories', addRecent(directory, settings.recentDirectories, settings.maxRecentDirectories, settings.favoritedDirectories));
        return { directory, recentDirectories: settings.recentDirectories, files };
    } catch (err) {
        showErrorBox('Failed to open directory.');
        throw err;
    }
});

ipcMain.handle('GET_IMAGE_DATA', async (e, filePath) => {
    if (settings.thumbnailsPreviewsEnabled !== 'both' && settings.thumbnailsPreviewsEnabled !== 'previews_only') return null;
    try {
        let mime;
        try {
            mime = 'image/' + (await sharp(filePath).metadata()).format;
        } catch (err) { }
        if (mime === 'image/svg') mime += '+xml';

        const browserSupportedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/x-icon', 'image/webp', 'image/heic', 'image/svg+xml'];

        if (mime && browserSupportedMimeTypes.includes(mime)) {
            return `data:${mime};base64,${(await fs.readFile(filePath)).toString('base64')}`; // If an image can be rendered by the browser display it natively
        } else {
            // Using jpeg here since large tiff files were causing the error too large for the webp format
            return `data:image/jpeg;base64,${(await sharp(filePath).jpeg().toBuffer()).toString('base64')}`; // If not try converting to jpeg
        }
    } catch (err) {
        return null;
    }
});

ipcMain.handle('LOAD_FILE', async (e, file) => {
    const cacheThumbnailFile = path.join(cacheDir, crypto.createHash('md5').update(file.path + ((await fs.stat(file.path)).mtime)).digest('hex') + '.webp');
    const cacheMetadataFile = cacheThumbnailFile.slice(0, -5) + '.json';
    
    file.loaded = true;

    if (!file.file) { // If file is a symlink or other non file or directory
        file.invalid = true;
        return file;
    }

    try {
        await fs.ensureDir(cacheDir);
        if (fs.existsSync(cacheMetadataFile)) {
            file.metadata = JSON.parse(await fs.readFile(cacheMetadataFile));
        } else {
            // -unknown is needed to retrieve GIF metadata, adding -fast breaks -unknown
            // -n disables print conversion and gets values in raw format
            file.metadata = await exiftool.read(file.path, ['-unknown', '-n']);
            fs.writeFileSync(cacheMetadataFile, JSON.stringify(file.metadata));
        }
        file.parsed = parseMetadata(file.metadata);
    } catch (err) {
        file.invalid = true;
    }

    if (!file.invalid) {
        try {
            if (settings.thumbnailsPreviewsEnabled === 'both' || settings.thumbnailsPreviewsEnabled === 'thumbnails_only') {
                let thumbnailBuffer;
                if (fs.existsSync(cacheThumbnailFile)) {
                    thumbnailBuffer = await fs.readFile(cacheThumbnailFile);
                } else {
                    thumbnailBuffer = await sharp(file.path).resize(thumbnailSize).webp().toBuffer();
                    await fs.writeFile(cacheThumbnailFile, thumbnailBuffer);
                }
                file.thumbnail = `data:image/webp;base64,${thumbnailBuffer.toString('base64')}`;
            }
        } catch (err) {
            console.error(err);
        }
    }

    return file;
});

ipcMain.handle('TRANSCRIBE', async (e, buffer, filePath) => {
    try {
        if (process.windowsStore && settings.useEmbeddedFfmpeg && !settings.useEmbeddedWhisper) {
            showErrorBox('Embedded FFmpeg cannot be used with OpenAI Whisper when the app is installed from the Microsoft Store. Switch to external FFmpeg in the settings menu.');
            throw new Error('Invalid configuration');
        }

        // Verify FFmpeg
        const ffmpegPath = settings.useEmbeddedFfmpeg ? embeddedFfmpegPath : 'ffmpeg';
        if (!settings.useEmbeddedFfmpeg && !commandExistsSync('ffmpeg')) {
            const response = dialog.showMessageBoxSync(win, {
                title: 'Error',
                type: 'error',
                message: `Make sure ffmpeg is installed and added to PATH. Would you like to be taken to the downloads?`,
                buttons: ['Yes', 'No'],
            });
            if (response === 0) await openFile('https://ffmpeg.org/download.html');
            throw new Error('Missing dependency');
        }

        let env = Object.assign({}, process.env);
        let pathKey = 'PATH';
        if (!env.hasOwnProperty('PATH')) pathKey = 'Path'; // Windows
        if (settings.useEmbeddedFfmpeg) env[pathKey] = `${path.dirname(ffmpegPath)}${process.platform === 'win32' ? ';' : ':'}${env[pathKey]}`;

        // Verify Whisper
        let whisperPath = settings.spawn || 'whisper';
        if (!settings.useEmbeddedWhisper) {
            let exists = commandExistsSync(whisperPath);
            if (!exists && whisperPath === 'whisper') { // If using OpenAI Whisper try to find the installation if it was not found on PATH
                if (process.platform === 'win32') {
                    whisperPath = path.join(os.homedir(), 'AppData\\Roaming\\Python\\Python310\\Scripts\\whisper.exe');
                } else if (process.platform === 'linux') {
                    whisperPath = path.join(os.homedir(), '.local/bin/whisper');
                }
                exists = commandExistsSync(whisperPath);
                if (!exists) whisperPath = 'whisper'; // Reset
            }

            if (!exists) {
                if (whisperPath === 'whisper') {
                    const response = dialog.showMessageBoxSync(win, {
                        title: 'Error',
                        type: 'error',
                        message: `Make sure whisper is installed and added to PATH. Would you like to be taken to the downloads?`,
                        buttons: ['Yes', 'No'],
                    });
                    if (response === 0) await openFile('https://github.com/openai/whisper#setup');
                } else {
                    showErrorBox(`Failed to spawn command "${command}".`);
                }
                throw new Error('Missing dependency');
            }
        }

        // Save recording
        await fs.ensureDir(recordingsDir);
        const timestamp = Date.now();
        const audioFile = path.join(recordingsDir, timestamp + (settings.audioCodec === 'audio/wav' ? '.wav' : '.opus'));
        await fs.writeFile(audioFile, Buffer.from(buffer));
        updateSetting('recordingsBytes', settings.recordingsBytes + buffer.byteLength);

        // Spawn Whisper
        if (settings.useEmbeddedWhisper) {
            whisperPath = path.join(__dirname, `/bin/${process.platform === 'win32' ? 'win32' : 'linux'}/whisper.cpp-1.2.1/main`).replace('app.asar' + path.sep + 'build', 'app.asar.unpacked' + path.sep + 'public');
            const transcriptionFile = path.join(recordingsDir, timestamp + '.txt');
            const tempAudioFile = audioFile.slice(0, -path.extname(audioFile).length) + '.temp.wav';

            await spawn(ffmpegPath, ['-i', audioFile, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', tempAudioFile]); // main currently runs only with 16-bit WAV files
            await spawn(whisperPath, ['--file', tempAudioFile, '--model', settings.cppModel || embeddedModelPath, '--language', settings.language, '--output-txt', '--output-file', transcriptionFile.slice(0, -4)]);
            if (!fs.existsSync(transcriptionFile)) throw new Error('No transcription found'); // whisper.cpp doesn't always give an error on failure

            const transcription = (await fs.readFile(transcriptionFile)).toString().trim().replaceAll('\r\n', '\n').replaceAll('\n', '');
            // const transcription = JSON.parse((await fs.readFile(transcriptionFile)).toString()).transcription.recuce((acc, segment) => acc += segment.text, '').trim();

            const metadata = settings.addMetadataToComment ? `\n\nAudio file: ${path.basename(audioFile)}\nUsing: whisper.cpp 1.2.1\nModel: ${settings.cppModel ? path.basename(settings.cppModel) : path.basename(embeddedModelPath)}\nLanguage: ${settings.language}\nDate: ${new Date().toISOString()}` : '';

            await fs.appendFile(recordingsFile, `${timestamp}\t${filePath}\r\n`);
            return transcription + metadata;
        } else {
            const transcriptionFile = path.join(recordingsDir, timestamp + '.json');

            if (!settings.seenSpeedWarning) {
                dialog.showMessageBoxSync(win, {
                    title,
                    type: 'info',
                    message: 'Models will be automatically downloaded the first time they are run. This may make the first transcription appear to take significantly longer to complete.',
                });
                updateSetting('seenSpeedWarning', true);
            }

            let args = [audioFile, '--model', settings.openaiModel, '--output_format', 'json', '--output_dir', recordingsDir];
            if (settings.language !== 'auto') args = [...args, '--language', settings.language]; // auto is not a valid option for OpenAI Whisper CLI language, it should use auto if not passed a language
            await spawn(whisperPath, args, { env });
            const transcription = JSON.parse(await fs.readFile(transcriptionFile)).text.trim();

            const metadata = settings.addMetadataToComment ? `\n\nAudio file: ${path.basename(audioFile)}\nUsing: OpenAI Whisper\nModel: ${settings.openaiModel}\nLanguage: ${settings.language}\nDate: ${new Date().toISOString()}` : '';

            await fs.appendFile(recordingsFile, `${timestamp}\t${filePath}\r\n`);
            return transcription + metadata;
        }
    } catch (err) {
        if (typeof err === 'object' && err !== null) {
            if (err.message !== 'Missing dependency' && err.message !== 'Invalid configuration') showErrorBox('Failed to transcribe audio.');
            throw err.stderr || err;
        } else {
            throw err;
        }
    }
});

ipcMain.handle('SAVE_EXIF', async (e, filePath, changedTags) => {
    const errorMessage = 'Failed to save all EXIF tags, some image types might not support specific tags. You can change which tags WhisperPix saves to in the settings menu.';
    try {
        let exif = { ...changedTags } // Replace empty strings with null to let ExifTool know to delete the tag
        for (let tag of Object.keys(exif)) {
            if (exif[tag] === '') exif[tag] = null;
        }

        await exiftool.write(filePath, exif, ['-overwrite_original']);

        // Verify all tags were written (if ExifTool writes at least one tag it will not throw an error, even if it fails to write other tags)
        const metadata = await exiftool.read(filePath, ['-unknown', '-n']);
        const parsed = parseMetadata(metadata);

        const failed = [];
        for (let tag of Object.keys(changedTags)) {
            if (changedTags[tag] !== parsed[tag]) failed.push(tag);
        }

        if (changedTags.hasOwnProperty(settings.keywordsTag) && changedTags[settings.keywordsTag] !== '') {
            for (let keyword of changedTags[settings.keywordsTag].split(', ')) {
                settings.recentKeywords = addRecent(keyword, settings.recentKeywords, settings.maxRecentKeywords);
            }
            updateSetting('recentKeywords', settings.recentKeywords);
        }

        if (failed.length > 0) showErrorBox(errorMessage + '\n\nFailed to save tags: ' + failed.join(', '));
        return { metadata, parsed, recentKeywords: settings.recentKeywords };
    } catch (err) {
        if (typeof err === 'object' && err !== null && typeof err.message === 'string') {
            if (err.message.startsWith('Temporary file already exists:')) {
                showErrorBox('Busy.');
            } else if (err.message.startsWith('File not found')) {
                showErrorBox('File not found.');
            } else if (err.message.startsWith(' renaming temporary file to')) {
                showErrorBox('File locked.');
            } else if (err.message.startsWith('Writing of this type of file is not supported') || err.message.split('-')[0].endsWith('files is not yet supported ')) {
                showErrorBox('File type unsupported.');
            } else if (err.message.startsWith('No success message: 0 image files updated')) {
                showErrorBox(errorMessage + '\n\nFailed to save tags: ' + Object.keys(changedTags).join(', '));
            } else {
                showErrorBox('Unknown error.');
            }
        } else {
            showErrorBox('Unknown error.');
        }
        throw err;
    }
});

ipcMain.on('UPDATE_SETTING', (e, key, value) => {
    try {
        updateSetting(key, value);
    } catch (err) {
        console.error(err);
        showErrorBox('Failed to save setting.');
    }
});

ipcMain.on('OPEN_FILE', async (e, filePath) => {
    // shell.openPath does not automatically translate the path to the sandboxed path if packaged as appx
    if (process.windowsStore && filePath === recordingsDir) {
        try {
            const randomSuffix = path.basename(path.join(path.dirname(app.getAppPath()), '../..')).split('_').pop(); // Get the appx random suffix from the install dir
            filePath = path.join(path.join(app.getPath('appData'), '..'), `Local/Packages/1018GrahamWalker.WhisperPix_${randomSuffix}/LocalCache/Roaming/whisperpix/WhisperPix Recordings`);
            if (!fs.existsSync(filePath)) filePath = recordingsDir; // Reset if not sandboxed
        } catch (err) { filePath = recordingsDir; }
    }
    
    try {
        if (typeof filePath !== 'string') filePath = '';
        if (filePath === recordingsDir) await fs.ensureDir(recordingsDir);
        await openFile(filePath);
    } catch (err) {
        console.error(err);
        showErrorBox(`Failed to open ${filePath.startsWith('http') ? 'URL' : 'file'}.`);
    }
});

ipcMain.handle('ERASE_RECORDINGS', (e) => {
    const response = dialog.showMessageBoxSync(win, {
        title,
        type: 'question',
        message: `Are you sure you want to erase all recordings?`,
        buttons: ['Yes', 'No'],
    });
    try {
        // Using sync because recordings keep getting locked when using Windows and OpenAI Whisper
        if (response === 0) fs.emptyDirSync(recordingsDir);
    } catch (err) {
        showErrorBox('Failed to erase recordings.');
        throw err;
    }
    return response === 0;
});

ipcMain.handle('CHOOSE_FILE', async (e) => {
    try {
        let filePath = dialog.showOpenDialogSync(win, { properties: ['openFile'] });
        if (typeof filePath === 'object') filePath = filePath[0];
        return filePath;
    } catch (err) {
        showErrorBox('Failed to select file.');
        throw err;
    }
});

ipcMain.handle('TOGGLE_FAVORITE', (e, directory) => {
    let recentDirectories = settings.recentDirectories;

    let index = recentDirectories.indexOf(directory);
    let favorite = index < settings.favoritedDirectories;
    recentDirectories.splice(index, 1);

    if (favorite) {
        updateSetting('favoritedDirectories', settings.favoritedDirectories - 1);
        recentDirectories = addRecent(directory, settings.recentDirectories, settings.maxRecentDirectories, settings.favoritedDirectories);
    } else {
        updateSetting('favoritedDirectories', settings.favoritedDirectories + 1);
        recentDirectories = addRecent(directory, settings.recentDirectories, settings.maxRecentDirectories);
    }

    updateSetting('recentDirectories', recentDirectories);
    return { recentDirectories, favoritedDirectories: settings.favoritedDirectories };
});

ipcMain.on('CLEAR_CACHE', async (e) => {
    try {
        await fs.ensureDir(cacheDir);
        let cacheFiles = (await fs.readdir(cacheDir)).length;
        fs.emptyDirSync(cacheDir);
        dialog.showMessageBoxSync(win, {
            title,
            type: 'info',
            message: `Deleted ${cacheFiles} temporary files.`,
        });
    } catch (err) {
        showErrorBox('Failed to clear cache.');
        throw err;
    }
});

const updateSetting = (key, value) => {
    settings[key] = value;
    store.set(key, value);
}

function showErrorBox(message) {
    dialog.showMessageBoxSync(win, {
        title: 'Error',
        type: 'error',
        message,
    });
}

const addRecent = (item, recentArray, max = 100, offset = 0) => {
    let index = recentArray.indexOf(item);
    if (index !== -1 && index < offset) offset = 0; // Offset is used if there are favorited directories
    if (index !== -1) recentArray.splice(index, 1);
    recentArray.splice(offset, 0, item);
    recentArray = recentArray.slice(0, max);
    return recentArray;
}

const openFile = async (filePath) => {
    if (process.platform === 'linux' && commandExistsSync('xdg-open')) {
        await spawn('xdg-open', [filePath]); // URLs hang indefinitely using shell.openExternal on Firefox on Linux so call xdg-open directly instead 
    } else {
        if (filePath.startsWith('http')) {
            shell.openExternal(filePath);
        } else {
            shell.openPath(filePath);
        }
    }
}

const parseMetadata = (metadata) => {
    const tags = [...settings.commentTagsAvailable, ...settings.keywordsTagsAvailable, ...settings.tagsAvailable];
    let parsed = {};
    for (let tag of tags) {
        if (metadata.hasOwnProperty(tag)) {
            if (Array.isArray(metadata[tag])) {
                parsed[tag] = metadata[tag].join(', ');
            } else if (typeof metadata[tag] === 'number') {
                parsed[tag] = metadata[tag].toString();
            } else if (typeof metadata[tag] === 'string') {
                parsed[tag] = metadata[tag];
            } else {
                parsed[tag] = '';
            }
        } else {
            parsed[tag] = '';
        }
    }
    return parsed;
}

const persistAvailable = (key, available) => {
    for (let item of available) {
        if (!settings[key].includes(item)) settings[key].push(item);
    }
    settings[key] = [...new Set(settings[key])]; // Also remove duplicates
    store.set(key, settings[key]);
}

const maxScalingFactor = () => {
    let scaleFactor = 1.0;
    for (let display of screen.getAllDisplays()) {
        if (display.scaleFactor > scaleFactor) {
            scaleFactor = display.scaleFactor; // OSs that do not support display scaling should default to 1.0
        }
    }
    return scaleFactor;
}

const readConfig = () => {
    try {
        store = new Store({ schema, clearInvalidConfig: true });
    } catch (err) {
        const errorMessage = 'Failed to read config.json.';
        if (typeof err === 'object' && err !== null && typeof err.message === 'string') {
            if (err.message.startsWith('Config schema violation: ')) {
                showErrorBox('Invalid values in config.json: ' + err.message.slice('Config schema violation: '.length).replaceAll('`', '"') + '.');
            } else {
                showErrorBox(errorMessage);
            }
        } else {
            showErrorBox(errorMessage);
        }
        app.exit(1);
    }

    store.store = { ...store.store }; // This writes the all values in the current store to disk
    settings = { ...store.store }; // Copy the store to a plain object so values are not reloaded live from the config file when accessed

    // Ensure settings always include the default options and remove duplicates (duplicates still need to be removed from value|description2 options)
    persistAvailable('commentTagsAvailable', commentTagsAvailable);
    persistAvailable('keywordsTagsAvailable', keywordsTagsAvailable);
    persistAvailable('tagsAvailable', tagsAvailable);
    persistAvailable('modelsAvailable', modelsAvailable);
    persistAvailable('languagesAvailable', languagesAvailable);

    // Ensure the setting for the enabled value is in the list of available values, if not set it to the default value
    if (!settings.commentTagsAvailable.includes(settings.commentTag)) store.reset('commentTag');
    if (!settings.keywordsTagsAvailable.includes(settings.keywordsTag)) store.reset('keywordsTag');
    for (let tag of settings.tagsEnabled) {
        if (!settings.tagsAvailable.includes(tag)) {
            store.reset('tagsEnabled');
            break;
        };
    }
    if (settings.modelsAvailable.findIndex(item => item.split('|')[0] === settings.openaiModel) === -1) store.reset('openaiModel');
    if (settings.languagesAvailable.findIndex(item => item.split('|')[0] === settings.language) === -1) store.reset('language');
    settings = { ...store.store };

    thumbnailSize = Math.ceil(maxScalingFactor() * settings.thumbnailBaseSize);
}
