import React, { useContext } from 'react';
import { Form, Button, Collapse, Modal, Stack, Tabs, Tab, InputGroup, Alert } from 'react-bootstrap';
import { SettingsContext } from '../SettingsContext';

const SettingsModal = (props) => {
    const { settings, updateSettings } = useContext(SettingsContext);

    const handleChange = (e) => {
        let value = e.target.value;

        if (e.target.multiple) {
            value = [];
            const options = e.target.options;

            for (let i = 0; i < options.length; i++) {
                if (options[i].selected) {
                    value.push(options[i].value);
                }
            }
        }

        if (value === 'true') value = true;
        if (value === 'false') value = false;

        updateSettings({ [e.target.id]: value });
        window.api.updateSetting(e.target.id, value);
    }

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = settings.platform === 'win32' ? 1024 : 1000;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    return (
        <Modal
            show={props.show}
            onHide={() => props.onShowChange(false)}
            size="lg"
            centered={true}
        >
            <Modal.Header closeButton>
                <Modal.Title>Settings</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Stack direction="horizontal" gap={2} className="mb-2">
                    <Form.Group controlId="audioCodec" className="w-100">
                        <Form.Label>Audio Codec:</Form.Label>
                        <Form.Select
                            className="mb-2"
                            value={settings.audioCodec}
                            onChange={handleChange}
                        >
                            <option value="audio/webm;codecs=opus">Opus &#40;good quality, small filesize&#41;</option>
                            <option value="audio/wav">WAV &#40;best quality, large filesize&#41;</option>
                        </Form.Select>
                    </Form.Group>
                    <Form.Group controlId="thumbnailsPreviewsEnabled" className="w-100">
                        <Form.Label>Thumbnail &amp; Previews:</Form.Label>
                        <Form.Select
                            className="mb-2"
                            value={settings.thumbnailsPreviewsEnabled}
                            onChange={handleChange}
                        >
                            <option value="both">Show Both</option>
                            <option value="thumbnails_only">Thumbnails Only</option>
                            <option value="previews_only">Previews Only</option>
                            <option value="neither">Neither</option>
                        </Form.Select>
                    </Form.Group>
                </Stack>
                <Stack direction="horizontal" gap={2} className="mb-2">
                    <div className="w-100">
                        <p className="mb-2 fw-bold">History &amp; Cache</p>
                        <Button
                            variant="light"
                            className="me-1"
                            onClick={() => {
                                updateSettings({ recentDirectories: [], favoritedDirectories: 0, recentKeywords: [] });
                                window.api.updateSetting('recentDirectories', []);
                                window.api.updateSetting('recentKeywords', []);
                                window.api.updateSetting('favoritedDirectories', 0);
                            }}
                        >
                            Clear History
                        </Button>
                        <Button
                            variant="light"
                            onClick={() => {
                                window.api.clearCache();
                            }}
                        >
                            Clear Cache
                        </Button>
                    </div>
                    <div className="w-100">
                        <p className="mb-2 fw-bold">Recordings &#40;{formatBytes(settings.recordingsBytes)}&#41;</p>
                        <Button
                            variant="light"
                            className="me-1"
                            onClick={() => window.api.openFile(settings.recordingsDir)}
                        >
                            Open Directory
                        </Button>
                        <Button
                            variant="danger"
                            onClick={() => {
                                window.api.eraseRecordings()
                                    .then((erased) => {
                                        if (erased) {
                                            updateSettings({ recordingsBytes: 0 });
                                            window.api.updateSetting('recordingsBytes', 0);
                                        }
                                    })
                                    .catch(err => {
                                        // Do nothing
                                        console.error(err);
                                    });
                            }}
                        >
                            Erase
                        </Button>
                    </div>
                </Stack>
                <div className="text-center">
                    <a
                        href="javascript:void(0)"
                        onClick={() => updateSettings({ showAdvanced: !settings.showAdvanced })}
                    >
                        {settings.showAdvanced ? 'Hide' : 'Show'} Advanced
                    </a>
                </div>
                <Collapse in={settings.showAdvanced}>
                    <div>
                        <Form.Group controlId="commentTag" className="w-100">
                            <Form.Label>Comment EXIF Tag</Form.Label>
                            <Form.Select
                                className="mb-2"
                                value={settings.commentTag}
                                onChange={handleChange}
                            >
                                {settings.commentTagsAvailable.map((tag, i) => <option value={tag} key={i}>{tag}</option>)}
                            </Form.Select>
                        </Form.Group>
                        <Form.Group controlId="keywordsTag" className="w-100">
                            <Form.Label>Keywords EXIF Tag</Form.Label>
                            <Form.Select
                                className="mb-2"
                                value={settings.keywordsTag}
                                onChange={handleChange}
                            >
                                {settings.keywordsTagsAvailable.map((tag, i) => <option value={tag} key={i}>{tag}</option>)}
                            </Form.Select>
                        </Form.Group>
                        <Form.Group controlId="tagsEnabled" className="w-100">
                            <Form.Label>Additional EXIF Tags</Form.Label>
                            <Form.Select
                                className="mb-2"
                                value={settings.tagsEnabled}
                                onChange={handleChange}
                                multiple={true}
                            >
                                {settings.tagsAvailable.map((tag, i) => <option value={tag} key={i}>{tag}</option>)}
                            </Form.Select>
                        </Form.Group>
                        <Form.Group controlId="useEmbeddedFfmpeg" className="w-100">
                            <Form.Label>FFmpeg:</Form.Label>
                            <Form.Select
                                className="mb-2"
                                value={settings.useEmbeddedFfmpeg}
                                onChange={handleChange}
                            >
                                <option value="true">Embedded FFmpeg</option>
                                <option value="false">External FFmpeg</option>
                            </Form.Select>
                        </Form.Group>
                        <Form.Group controlId="useEmbeddedWhisper" className="w-100">
                            <Form.Label>Whisper:</Form.Label>
                            <Form.Select
                                className="mb-2"
                                value={settings.useEmbeddedWhisper}
                                onChange={handleChange}
                            >
                                <option value="true">whisper.cpp &#40;CPU&#41;</option>
                                <option value="false">OpenAI Whisper &#40;CPU/GPU&#41;</option>
                            </Form.Select>
                        </Form.Group>
                        <Form.Group controlId="language" className="w-100">
                            <Form.Label>Language:</Form.Label>
                            <Form.Select
                                className="mb-2"
                                value={settings.language}
                                onChange={handleChange}
                            >
                                {settings.languagesAvailable.map((model, i) => {
                                    let arg = model.split('|')[0];
                                    let name = model.split('|')[1] || arg;
                                    return <option value={arg} key={i}>{name}</option>
                                })}
                            </Form.Select>
                        </Form.Group>
                        <Tabs
                            variant="pills"
                            className="mb-2"
                        >
                            <Tab eventKey="cpp" title="whisper.cpp">
                                <Alert className="mb-2">An embedded tiny model (ggml-tiny.bin) is used by default. Larger models can downloaded <a
                                    href="javascript:void(0)"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        window.api.openFile('https://github.com/ggerganov/whisper.cpp#ggml-format');
                                    }}
                                >here</a>.</Alert>
                                <Form.Group controlId="cppModel" className="w-100">
                                    <Form.Label>Model:</Form.Label>
                                    <InputGroup>
                                        <Button
                                            onClick={() => {
                                                window.api.chooseFile()
                                                    .then((filePath) => {
                                                        if (filePath) {
                                                            updateSettings({ cppModel: filePath });
                                                            window.api.updateSetting('cppModel', filePath);
                                                        }
                                                    })
                                                    .catch(err => {
                                                        // Do nothing
                                                        console.error(err);
                                                    })
                                            }}
                                            variant="light"
                                            style={{ border: '1px solid #ced4da' }}
                                        >
                                            Choose File
                                        </Button>
                                        <Form.Control
                                            value={settings.cppModel}
                                            onChange={handleChange}
                                            placeholder="Path to model file"
                                        />
                                    </InputGroup>
                                </Form.Group>
                            </Tab>
                            <Tab eventKey="openai" title="OpenAI Whisper">
                                <Alert className="mb-2">OpenAI Whisper must be installed before it can be used with WhisperPix. It can be downloaded <a
                                    href="javascript:void(0)"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        window.api.openFile('https://github.com/openai/whisper#setup');
                                    }}
                                >here</a>.</Alert>
                                <Form.Group controlId="spawn" className="w-100 mb-2">
                                    <Form.Label>Command:</Form.Label>
                                    <Form.Control
                                        value={settings.spawn}
                                        onChange={handleChange}
                                        placeholder="whisper"
                                    />
                                </Form.Group>
                                <Form.Group controlId='openaiModel' className="w-100">
                                    <Form.Label>Model:</Form.Label>
                                    <Form.Select
                                        className="mb-2"
                                        value={settings.openaiModel}
                                        onChange={handleChange}
                                    >
                                        {settings.modelsAvailable.map((model, i) => {
                                            let arg = model.split('|')[0];
                                            let name = model.split('|')[1] || arg;
                                            return <option value={arg} key={i}>{name}</option>
                                        })}
                                    </Form.Select>
                                </Form.Group>
                            </Tab>
                        </Tabs>
                    </div>
                </Collapse>

            </Modal.Body>
        </Modal>
    );
}

export default SettingsModal;
