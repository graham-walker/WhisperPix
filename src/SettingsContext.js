import React, { createContext, useState } from 'react';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState({
        version: null,
        recentDirectories: [],
        recentKeywords: [],
        storeFile: null,
        showMore: false,
        commentTag: null,
        keywordsTag: null,
        repoUrl: null,
        showAdvanced: false,
        tagsAvailable: [],
        commentTagsAvailable: [],
        keywordsTagsAvailable: [],
        languagesAvailable: [],
        modelsAvailable: [],
        favoritedDirectories: 0,
    });

    const updateSettings = (newSettings) => {
        setSettings((prevSettings) => ({ ...prevSettings, ...newSettings }));
    };

    const contextValue = { settings, updateSettings };

    return (
        <SettingsContext.Provider value={contextValue}>
            {children}
        </SettingsContext.Provider>
    );
};
