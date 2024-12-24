// Flaga przetwarzania
let isProcessing = false;

// Funkcja sprawdzająca, czy karta Creative Fabrica jest już otwarta
async function openOrSwitchToCreativeFabrica() {
    const fabricaStudioUrl = "https://studio.creativefabrica.com/flow/?new=true";
    const tabs = await browser.tabs.query({ url: "*://studio.creativefabrica.com/*" });

    console.log("Existing tabs with Creative Fabrica:", tabs.map(tab => tab.url));

    // Zamknij wszystkie zakładki Creative Fabrica oprócz jednej poprawnej
    for (const tab of tabs) {
        if (tab.url !== fabricaStudioUrl) {
            console.log("Closing incorrect Creative Fabrica tab:", tab.url);
            await browser.tabs.remove(tab.id);
        }
    }

    const correctTabs = tabs.filter(tab => tab.url === fabricaStudioUrl);

    if (correctTabs.length > 0) {
        console.log("Switching to existing Creative Fabrica Studio tab...");
        await browser.tabs.update(correctTabs[0].id, { active: true });
        await waitForPageLoad(correctTabs[0].id);
        return correctTabs[0].id;
    } else {
        console.log("Opening new Creative Fabrica Studio tab...");
        const tab = await browser.tabs.create({ url: fabricaStudioUrl });
        await waitForPageLoad(tab.id);
        return tab.id;
    }
}

// Funkcja czekająca na pełne załadowanie strony
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
                    console.log("Still loading...");
                    setTimeout(checkReadyState, 500);
                }
            });
        };
        checkReadyState();
    });
}

// Funkcja wypełniająca prompt
async function fillPrompt(tabId, prompt) {
    await browser.tabs.executeScript(tabId, {
        code: `
            (function() {
                const textarea = document.querySelector('textarea');
                if (textarea) {
                    console.log("Filling prompt...");
                    textarea.value = \`${prompt}\`;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    console.error("Prompt textarea not found.");
                }
            })();
        `
    });
}

// Funkcja ustawiająca rozdzielczość
async function setResolution(tabId, resolution = "Square 1:1") {
    await browser.tabs.executeScript(tabId, {
        code: `
            (async function() {
                const dropdownButton = document.querySelector('button[data-studiobuttonicon]');
                if (!dropdownButton) {
                    console.error("Resolution dropdown button not found.");
                    return;
                }

                console.log("Opening resolution dropdown...");
                dropdownButton.click();

                let retries = 20;
                while (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const option = Array.from(document.querySelectorAll('button span'))
                        .find(span => span.textContent.trim() === '${resolution}');
                    if (option) {
                        console.log("Selecting resolution: ${resolution}");
                        option.click();
                        return;
                    }
                    retries--;
                }
                console.error("Resolution option not found.");
            })();
        `
    });
}

// Funkcja klikająca przycisk „Generate”
async function clickGenerate(tabId) {
    await browser.tabs.executeScript(tabId, {
        code: `
            (function() {
                const generateButton = document.querySelector('button[type="submit"]');
                if (generateButton) {
                    console.log("Clicking Generate...");
                    generateButton.click();
                } else {
                    console.error("Generate button not found.");
                }
            })();
        `
    });
}

// Funkcja przetwarzająca projekt
async function processDesign(project) {
    if (isProcessing) {
        console.log("Bot is already processing a design. Ignoring:", project.title);
        return;
    }

    isProcessing = true;

    try {
        console.log("Processing design:", project.title);

        const tabId = await openOrSwitchToCreativeFabrica();

        console.log("Inserting prompt...");
        await fillPrompt(tabId, project.prompt);

        console.log("Setting resolution...");
        await setResolution(tabId, "Square 1:1");

        console.log("Clicking Generate...");
        await clickGenerate(tabId);

        console.log("Design processed successfully:", project.title);
    } catch (error) {
        console.error("Error processing design:", error);
    } finally {
        isProcessing = false;
    }
}

// Obsługa wiadomości z popup.js
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === "startLoginProcess") {
        console.log("Starting design process...");
        await processDesign(message.project);
    }

    if (message.action === "startBulkProcess") {
        console.log("Starting bulk process...");
        for (const project of message.projects) {
            await processDesign(project);
        }
        console.log("Bulk process complete.");
    }
});
