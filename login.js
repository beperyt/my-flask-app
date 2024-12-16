// Globalne zmienne
let isProcessing = false;
let projectQueue = [];
let activeTabId = null;

// 1. Funkcja otwierająca lub przełączająca się na Creative Fabrica Studio
async function openOrSwitchToCreativeFabrica() {
    const fabricaStudioUrl = "https://studio.creativefabrica.com/flow/?new=true";

    if (activeTabId) {
        console.log("Using existing tab:", activeTabId);
        await browser.tabs.update(activeTabId, { active: true });
        await waitForPageLoad(activeTabId);
        return activeTabId;
    }

    const tabs = await browser.tabs.query({ url: "*://studio.creativefabrica.com/*" });

    if (tabs.length > 0) {
        console.log("Switching to existing Creative Fabrica Studio tab...");
        activeTabId = tabs[0].id;
        await browser.tabs.update(activeTabId, { active: true });
        await waitForPageLoad(activeTabId);
        return activeTabId;
    } else {
        console.log("Opening new Creative Fabrica Studio tab...");
        const tab = await browser.tabs.create({ url: fabricaStudioUrl });
        activeTabId = tab.id;
        await waitForPageLoad(activeTabId);
        return activeTabId;
    }
}

// 2. Funkcja czekająca na pełne załadowanie strony
async function waitForPageLoad(tabId) {
    console.log("Waiting for page to fully load...");
    return new Promise((resolve) => {
        const checkReadyState = () => {
            browser.tabs.executeScript(tabId, {
                code: "document.readyState === 'complete'"
            }).then((result) => {
                if (result && result[0]) {
                    console.log("Page fully loaded.");
                    resolve();
                } else {
                    setTimeout(checkReadyState, 500);
                }
            });
        };
        checkReadyState();
    });
}

// 3. Funkcja wypełniająca prompt
async function fillPrompt(tabId, prompt) {
    await browser.tabs.executeScript(tabId, {
        code: `
            (function() {
                const textarea = document.querySelector('textarea');
                if (textarea) {
                    textarea.value = \`${prompt}\`;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    console.error("Prompt textarea not found.");
                }
            })();
        `
    });
}

// 4. Funkcja ustawiająca rozdzielczość
async function setResolution(tabId, resolution = "Square 1:1") {
    await browser.tabs.executeScript(tabId, {
        code: `
            (async function() {
                const dropdownButton = document.querySelector('button[data-studiobuttonicon]');
                if (dropdownButton) {
                    dropdownButton.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const option = Array.from(document.querySelectorAll('button span'))
                        .find(span => span.textContent.trim() === '${resolution}');
                    if (option) {
                        option.click();
                    } else {
                        console.error("Resolution option not found.");
                    }
                } else {
                    console.error("Resolution dropdown not found.");
                }
            })();
        `
    });
}

// 5. Funkcja klikająca przycisk „Generate”
async function clickGenerate(tabId) {
    await browser.tabs.executeScript(tabId, {
        code: `
            (function() {
                const generateButton = document.querySelector('button[type="submit"]');
                if (generateButton) {
                    generateButton.click();
                } else {
                    console.error("Generate button not found.");
                }
            })();
        `
    });
}

// 6. Funkcja przetwarzająca pojedynczy projekt
async function processDesign(project) {
    if (isProcessing) {
        projectQueue.push(project);
        return;
    }

    isProcessing = true;

    try {
        const tabId = await openOrSwitchToCreativeFabrica();
        await fillPrompt(tabId, project.prompt);
        await setResolution(tabId, "Square 1:1");
        await clickGenerate(tabId);
        console.log("Project processed:", project.title);
    } catch (error) {
        console.error("Error processing design:", error);
    } finally {
        isProcessing = false;
        if (projectQueue.length > 0) {
            const nextProject = projectQueue.shift();
            await processDesign(nextProject);
        }
    }
}

// 7. Funkcja obsługująca kolejkę projektów
async function processQueue() {
    if (!isProcessing && projectQueue.length > 0) {
        const project = projectQueue.shift();
        await processDesign(project);
    }
}

// 8. Funkcja obsługująca proces bulk
async function handleBulkProcess(projects) {
    projectQueue.push(...projects);
    await processQueue();
}

// 9. Funkcja sprawdzająca status logowania
async function checkLoginStatus(tabId) {
    const result = await browser.tabs.executeScript(tabId, {
        code: `
            (function() {
                return !!document.querySelector('img[alt="Profile"]') || !document.querySelector('button[data-studiobuttonicon]');
            })();
        `
    });
    return result[0];
}

// 10. Funkcja upewniająca się, że użytkownik jest zalogowany
async function ensureLoggedIn(tabId) {
    const loggedIn = await checkLoginStatus(tabId);

    if (!loggedIn) {
        console.log("User not logged in. Attempting to log in...");
        await browser.tabs.executeScript(tabId, {
            code: `
                const loginButton = document.querySelector('button[data-studiobuttonicon]');
                if (loginButton) {
                    loginButton.click();
                } else {
                    console.error("Login button not found.");
                }
            `
        });
        alert("Please log in manually, then click OK to continue.");
        return ensureLoggedIn(tabId);
    }
    console.log("User is logged in.");
}

// 11. Obsługa wiadomości z popup.js
browser.runtime.onMessage.addListener(async (message) => {
    if (message.action === "startLoginProcess") {
        await processDesign(message.project);
    } else if (message.action === "startBulkProcess") {
        await handleBulkProcess(message.projects);
    }
});
