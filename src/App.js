import { useState, useEffect, useContext, useRef } from 'react';
import './index.scss';
import { Button, Spinner, Badge, Form, InputGroup, ButtonGroup } from 'react-bootstrap';
import * as Icon from 'react-bootstrap-icons';
import AudioRecorder from './components/AudioRecorder';
import TextLogo from './img/WhisperPix_text_only512x363.png';
import { SettingsContext } from './SettingsContext';
import SettingsModal from './components/SettingsModal';

function App() {
    const { settings, updateSettings } = useContext(SettingsContext);

    const [directory, setDirectory] = useState(null);
    const [barDirectory, setBarDirectory] = useState(directory);
    const [files, setFiles] = useState(null);
    const [loadedFileIndex, setLoadedFileIndex] = useState(null);
    const [selectedFileIndex, setSelectedFileIndex] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewImageData, setPreviewImageData] = useState(null);
    const [screenLock, setScreenLock] = useState(null);
    const [showSettings, setShowSettings] = useState(false);

    const directoryRef = useRef();
    directoryRef.current = directory; // directoryRef.current will always have the most recent directory state value in callbacks

    useEffect(() => {
        window.api.init()
            .then(settings => {
                updateSettings(settings);
            });
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.code == 'Minus' || e.code == 'Equal') && (e.ctrlKey || e.metaKey)) e.preventDefault(); // Disable plus/minus zoom
            if (screenLock) e.preventDefault(); // Disable keyboard navigation while transcribing
        };

        const handleMouseWheel = (e) => { // Disable scroll zoom
            if (e.ctrlKey) {
                e.preventDefault();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousewheel', handleMouseWheel);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousewheel', handleMouseWheel);
        };
    }, [screenLock]);

    function openDirectory(newDirectory) { // Pass undefined to open directory picker
        if (newDirectory && directory === newDirectory) return;
        window.api.openDirectory(newDirectory, directory)
            .then((data) => {
                if (!data) return; // No directory was selected in picker

                setDirectory(data.directory);
                setBarDirectory(data.directory);
                updateSettings({ recentDirectories: data.recentDirectories });

                setPreviewImageData(null);
                setSelectedFileIndex(null);
                setSelectedFile(null);

                let newLoadedIndex = data.files.findIndex(file => !file.loaded);
                if (newLoadedIndex === -1) newLoadedIndex = data.files.length;

                setLoadedFileIndex(newLoadedIndex);
                setFiles(data.files);
            })
            .catch((err) => {
                // Do nothing
                console.error(err);
            });
    }

    function selectFile(i) {
        if (i === selectedFileIndex) {
            setPreviewImageData(null);
            setSelectedFileIndex(null);
            setSelectedFile(null);
            return;
        }

        if (settings.thumbnailsPreviewsEnabled === 'both' || settings.thumbnailsPreviewsEnabled === 'previews_only') {
            setScreenLock('discreet_getting_preview');
            window.api.getImageData(files[i].path).then(imageData => {
                setPreviewImageData(imageData);
                setSelectedFileIndex(i);
                setSelectedFile(files[i]);
                setScreenLock(null);
            });
        } else {
            setPreviewImageData(null);
            setSelectedFileIndex(i);
            setSelectedFile(files[i]);
        }
    }

    function loadNextFile() {
        window.api.loadFile(files[loadedFileIndex]).then(newFile => {
            if (directoryRef.current !== directory) return;
            const newFiles = [...files];
            newFiles[loadedFileIndex] = newFile;
            setFiles(newFiles);
            setLoadedFileIndex(loadedFileIndex + 1);
        });
    }

    useEffect(() => {
        if (files?.length && loadedFileIndex < files.length) loadNextFile();
    }, [directory, loadedFileIndex]);

    return (
        <>
            <div className="App">
                {screenLock &&
                    <div id="screen-lock" className={(typeof screenLock === 'string' && screenLock.startsWith('discreet')) ? 'discreet' : undefined}><h1>Transcribing audio, please wait...</h1><Spinner /></div>
                }
                <div id="recent-directories" className="pullout">
                    <div className="area">
                        <div className="sticky-cover">
                            <Button
                                className="directory new"
                                onClick={() => openDirectory()}
                            >
                                <Icon.Folder /> Open Directory
                            </Button>
                        </div>
                        {settings.recentDirectories.map((directory, i) =>
                            <ButtonGroup
                                key={i + directory}
                            >
                                <Button
                                    className="directory"
                                    onClick={() => openDirectory(directory)}
                                    title={directory}
                                    variant="light"
                                >
                                    {directory}
                                </Button>
                                <Button
                                    className={`favorite${i < settings.favoritedDirectories ? ' is-favorite' : ''}`}
                                    variant="light"
                                    onClick={() => {
                                        window.api.toggleFavorite(directory)
                                            .then(data => {
                                                updateSettings({ recentDirectories: data.recentDirectories, favoritedDirectories: data.favoritedDirectories });
                                            });
                                    }}
                                >
                                    {i < settings.favoritedDirectories ? <Icon.StarFill /> : <Icon.Star />}
                                </Button>
                            </ButtonGroup>
                        )}
                    </div>
                    <div className="pullout-bottom">
                        <div className="d-flex align-items-center me-1">
                            <img className="logo" src={TextLogo} alt="Logo" />
                            {settings.version && <small className="ms-1"><Badge bg="light" text="dark">{settings.version}</Badge></small>}
                        </div>
                        <Button
                            variant="light"
                            onClick={() => setShowSettings(true)}
                            size="sm"
                            className="ms-auto me-1"
                        >
                            <Icon.GearFill className="align-self-center" />
                        </Button>
                        <Button
                            variant="light"
                            onClick={() => window.api.openFile(settings.repoUrl)}
                            size="sm"
                        >
                            <Icon.Github className="align-self-center" />
                        </Button>
                    </div>
                </div>
                <div id="preview-area">
                    <div id="directory-controls">
                        <InputGroup>
                            <Button
                                onClick={() => directory && openDirectory(directory + settings.sep + '..')}
                            >
                                <Icon.ArrowLeftShort />
                            </Button>
                            <Form.Control
                                value={barDirectory || ''}
                                onChange={(e) => setBarDirectory(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && barDirectory && openDirectory(barDirectory)}
                            />
                        </InputGroup>
                    </div>
                    <div id="preview">
                        {selectedFile && previewImageData &&
                            <img
                                src={previewImageData}
                                onClick={() => window.api.openFile(selectedFile.path)}
                                alt="Preview"
                            />
                        }
                    </div>

                    <div id="files" className="area">
                        {files === null || files.length === 0
                            ?
                            <a
                                href='javascript:void(0)'
                                onClick={() => openDirectory()}
                                id="no-files"
                            >
                                {files === null ? 'Open a directory.' : 'Directory is empty.'}
                            </a>

                            : files.slice(0, loadedFileIndex).map((file, i) =>
                                <div
                                    key={i}
                                    className={`file${file.invalid ? ' disabled' : ''}${selectedFileIndex === i ? ' active' : ''}`}
                                    onClick={(e) => {
                                        if (file.invalid) return;
                                        if (e.shiftKey) {
                                            window.api.openFile(file.path);
                                        } else {
                                            file.directory
                                                ? openDirectory(file.path)
                                                : selectFile(i);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (file.invalid) return;
                                        if (e.key === 'Enter') {
                                            if (e.shiftKey) {
                                                window.api.openFile(file.path);
                                            } else {
                                                file.directory
                                                    ? openDirectory(file.path)
                                                    : selectFile(i);
                                            }
                                        }
                                    }}
                                    tabIndex={file.invalid ? undefined : 0}
                                >
                                    {(file.parsed[settings.commentTag] || file.parsed[settings.keywordsTag]) &&
                                        <div className="tag-badge">
                                            {file.parsed[settings.commentTag] ? <Icon.ChatDotsFill size={24} /> : <Icon.TagsFill size={24} />}
                                        </div>
                                    }
                                    {file.directory
                                        ? <Icon.Folder size={104} />
                                        : file.thumbnail
                                            ? <img src={file.thumbnail} alt="Thumbnail" />
                                            : <>{file.ext && file.ext.length < 6 && <span className="ext-badge">{file.ext.slice(1)}</span>}<Icon.FileEarmark size={104} /></>
                                    }
                                    <p className="name" title={file.name}>{file.name}</p>
                                </div>
                            )
                        }
                        {/* {files && loadedFileIndex < files.length && <Spinner/>} */}
                    </div>
                </div>
                {selectedFile &&
                    <div id="recordings" className="pullout">
                        <AudioRecorder
                            screenLock={screenLock}
                            onScreenLockChange={screenLock => setScreenLock(screenLock)}
                            onFileChange={newFile => {
                                const newFiles = [...files];
                                newFiles[selectedFileIndex] = newFile;
                                setFiles(newFiles);
                                setSelectedFile(newFile);
                            }}
                            file={selectedFile}
                            key={selectedFileIndex}
                            showSettings={showSettings}
                        />
                    </div>
                }
            </div>
            <SettingsModal show={showSettings} onShowChange={show => setShowSettings(show)} />
        </>
    );
}

export default App;
