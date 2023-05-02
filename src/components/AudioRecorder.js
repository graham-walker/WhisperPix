import React, { useState, useRef, useContext, useEffect } from 'react';
import { Form, Button, InputGroup, Dropdown, Collapse } from 'react-bootstrap';
import * as Icon from 'react-bootstrap-icons';
import { SettingsContext } from '../SettingsContext';
import { MediaRecorder, register } from 'extendable-media-recorder';
import { connect } from 'extendable-media-recorder-wav-encoder';

function AudioRecorder(props) {
    const file = props.file;

    const { settings, updateSettings } = useContext(SettingsContext);

    const [recording, setRecording] = useState(false);
    const [time, setTime] = useState(0);
    const [tags, setTags] = useState(file.parsed);

    const changedTags = [settings.commentTag, settings.keywordsTag, ...settings.tagsEnabled].reduce((acc, tag) => {
        if (tags[tag] !== file.parsed[tag]) acc[tag] = tags[tag];
        return acc;
    }, {});

    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null); // Unlike the native MediaRecorder, extendable-media-recorder does not expose stream as a property of MediaRecorder
    const forceStopped = useRef(false);

    const startRecording = async () => {
        forceStopped.current = false;
        setTime(0);

        try {
            await register(await connect());
        } catch (err) {
            // WAV encoder only needs to be registered once
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 1000000000, mimeType: settings.audioCodec }); // audioBitsPerSecond will automatically lower to maximum supported bitrate
        mediaRecorderRef.current = mediaRecorder;

        const chunks = [];

        const timeInterval = setInterval(() => {
            setTime(prevtime => prevtime + 1);
        }, 1000);

        mediaRecorder.addEventListener('dataavailable', event => {
            chunks.push(event.data);
        });

        mediaRecorder.addEventListener('stop', async () => {
            clearInterval(timeInterval);
            if (forceStopped.current) return;

            const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
            const buffer = await blob.arrayBuffer();

            props.onScreenLockChange('transcribing');
            window.api.transcribe(buffer, props.file.path)
                .then(transcription => {
                    if (transcription) {
                        setTags({ ...tags, [settings.commentTag]: transcription });

                        const newRecordingSize = settings.recordingsBytes + buffer.byteLength;
                        updateSettings({ recordingsBytes: newRecordingSize });
                        window.api.updateSetting('recordingsBytes', newRecordingSize);
                    }
                    props.onScreenLockChange(null);
                })
                .catch(err => {
                    console.error(err);
                    props.onScreenLockChange(null);
                });
        });

        mediaRecorder.start();
        setRecording(true);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
            setRecording(false);
        }
    };

    const forceStopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            forceStopped.current = true;
            stopRecording();
        }
    }

    const formatTime = (time) => {
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const seconds = time % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function normalizeKeywords(keywords) {
        keywords = keywords.replaceAll(';', ',').replace(/,\s*/g, ',').replace(/,+/g, ',');
        if (keywords.startsWith(',')) keywords = keywords.slice(1);
        if (keywords.endsWith(',')) keywords = keywords.slice(0, -1);
        keywords = keywords.replaceAll(',', ', ');
        keywords = keywords.split(', ');
        for (let keyword in keywords) keywords[keyword] = keywords[keyword].trim();
        keywords = keywords.join(', ');
        return keywords;
    }

    useEffect(() => {
        return () => { forceStopRecording(); }
    }, []);

    useEffect(() => {
        forceStopRecording();
    }, [props.file, props.showSettings]);

    return (
        <>
            <div className="area">
                <div id="audio-recorder" className={!props.file ? ' disabled' : ''}>
                    <div id="recording-icon" className={`mb-2${recording ? ' recording' : ''}`}><Icon.MicFill size={110} /></div>
                    <p>{formatTime(time)}</p>
                    <Button
                        variant={recording ? 'secondary' : 'danger'}
                        className="mb-2"
                        onClick={recording ? stopRecording : startRecording}
                    >
                        {recording ? 'Stop' : 'Start'} Recording
                    </Button>
                    <Form.Group controlId='keywords-field' className="w-100 mb-2">
                        <Form.Label>{settings.keywordsTag}:</Form.Label>
                        <InputGroup>
                            <Form.Control
                                placeholder="Separate keywords with commas"
                                value={tags[settings.keywordsTag]}
                                onChange={e => setTags({ ...tags, [settings.keywordsTag]: e.target.value })}
                                disabled={recording}
                            />
                            <Dropdown
                                autoClose="outside"
                            >
                                <Dropdown.Toggle
                                    disabled={recording}
                                >
                                    <Icon.Plus />
                                </Dropdown.Toggle>
                                <Dropdown.Menu>
                                    <Dropdown.Header>Recent keywords</Dropdown.Header>
                                    {settings.recentKeywords.map((keyword, i) => {
                                        const keywords = tags[settings.keywordsTag] || '';
                                        return (
                                            <Dropdown.Item
                                                title={keyword}
                                                active={normalizeKeywords(keywords).split(', ').includes(keyword)}
                                                onClick={() => {
                                                    let normalizedKeywords = normalizeKeywords(keywords).split(', ');
                                                    if (normalizedKeywords.includes(keyword)) {
                                                        setTags({ ...tags, [settings.keywordsTag]: normalizedKeywords.filter(existingKeyword => existingKeyword !== keyword).join(', ') });
                                                    } else {
                                                        let newKeywords = normalizedKeywords.join(', ');
                                                        if (newKeywords) {
                                                            newKeywords += ', ' + keyword;
                                                        } else {
                                                            newKeywords = keyword;
                                                        }
                                                        setTags({ ...tags, [settings.keywordsTag]: newKeywords });
                                                    }
                                                }}
                                                key={i}
                                            >
                                                {keyword}
                                            </Dropdown.Item>
                                        );
                                    })}
                                </Dropdown.Menu>
                            </Dropdown>
                        </InputGroup>
                    </Form.Group>
                    <Form.Group controlId='comment-field' className="w-100 mb-2">
                        <Form.Label>{settings.commentTag}:</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={6}
                            value={tags[settings.commentTag]}
                            onChange={e => setTags({ ...tags, [settings.commentTag]: e.target.value })}
                            placeholder="Start recording to transcribe a comment"
                            disabled={recording}
                        />
                    </Form.Group>
                    <a
                        href="javascript:void(0)"
                        onClick={() => updateSettings({ showMore: !settings.showMore })}
                    >
                        {settings.showMore ? 'Hide' : 'Show'} More
                    </a>
                    <Collapse in={settings.showMore}>
                        <div className="w-100">
                            {settings.tagsEnabled.map((tag, i) =>
                                <Form.Group controlId={tag + '-field'} className="w-100 mb-2" key={i}>
                                    <Form.Label>{tag}:</Form.Label>
                                    <Form.Control
                                        value={tags[tag]}
                                        onChange={e => setTags({ ...tags, [tag]: e.target.value })}
                                        placeholder="Enter tag value"
                                        disabled={recording}
                                    />
                                </Form.Group>
                            )}
                            <Form.Group controlId='exif-field' className="w-100 mb-2">
                                <Form.Label>EXIF Data &#40;readonly&#41;:</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={6}
                                    value={JSON.stringify(file.metadata)}
                                    onChange={() => { }}
                                    disabled={true}
                                />
                            </Form.Group>
                        </div>
                    </Collapse>
                </div>
            </div>
            <div className="pullout-bottom">
                <Button
                    disabled={recording || Object.keys(changedTags).length === 0 || props.screenLock === 'discreet_saving'}
                    onClick={() => {
                        props.onScreenLockChange('discreet_saving');

                        let normalizedTags = { ...changedTags };
                        if (normalizedTags.hasOwnProperty(settings.keywordsTag)) {
                            normalizedTags[settings.keywordsTag] = normalizeKeywords(normalizedTags[settings.keywordsTag]);
                        }
                        for (let tag of Object.keys(normalizedTags)) normalizedTags[tag] = normalizedTags[tag].trim();
                        setTags({ ...tags, ...normalizedTags });

                        for (let tag of Object.keys(normalizedTags)) {
                            if (normalizedTags[tag] === file.parsed[tag]) {
                                delete normalizedTags[tag];
                            }
                        }
                        if (Object.keys(normalizedTags).length === 0) { // If the normalized tags are all the same as the pre-change tags do not save (prevents an ExifTool error when the tag is empty)
                            props.onScreenLockChange(null);
                            return;
                        }

                        window.api.saveExif(file.path, normalizedTags)
                            .then(data => {
                                let newFile = file;
                                newFile.metadata = data.metadata;
                                newFile.parsed = data.parsed;
                                props.onFileChange(newFile);
                                updateSettings({ recentKeywords: data.recentKeywords });
                                props.onScreenLockChange(null);
                            })
                            .catch(err => {
                                console.error(err);
                                props.onScreenLockChange(null);
                            });
                    }}
                    className="mx-auto"
                >
                    Save
                    <div className={`unsaved-badge${Object.keys(changedTags).length > 0 ? ' active' : ''}`}></div>
                </Button>
            </div>
        </>
    );
}

export default AudioRecorder;
