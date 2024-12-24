console.log("Ideogram script loaded.");

// Funkcja otwierająca Ideogram AI i wykonująca działania
async function openIdeogramAndGenerate() {
    const ideogramUrl = "https://ideogram.ai";

    try {
        console.log("Opening Ideogram AI...");
        const tab = await browser.tabs.create({ url: ideogramUrl });

        // Czekaj na załadowanie strony
        await waitForPageLoad(tab.id);

        // Pobierz prompt z IndexedDB
        const prompt = await getPromptFromIndexedDB();
        console.log("Prompt fetched:", prompt);

        if (prompt) {
            // Wklej prompt do textarea na stronie Ideogram AI
            await insertPrompt(tab.id, prompt);

            // Kliknij przycisk "Generate"
            await clickGenerateButton(tab.id);
        } else {
            console.error("No prompt found in IndexedDB.");
        }
    } catch (error) {
        console.error("Error during Ideogram generation process:", error);
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

// Funkcja pobierająca prompt z IndexedDB
function getPromptFromIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("DesignDatabase", 1);

        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction("designs", "readonly");
            const objectStore = transaction.objectStore("designs");
            const getAllRequest = objectStore.getAll();

            getAllRequest.onsuccess = () => {
                const designs = getAllRequest.result;
                const promptDesign = designs.find((design) => design.prompt);
                resolve(promptDesign ? promptDesign.prompt : null);
            };

            getAllRequest.onerror = () => reject("Failed to fetch prompt from IndexedDB");
        };

        request.onerror = () => reject("Failed to open IndexedDB");
    });
}

// Funkcja wklejająca prompt na stronie Ideogram AI
async function insertPrompt(tabId, prompt) {
    console.log("Inserting prompt into Ideogram...");
    await browser.tabs.executeScript(tabId, {
        code: `
            (function() {
                const textarea = document.querySelector('textarea');
                if (textarea) {
                    textarea.value = \`${prompt}\`;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    console.log("Prompt inserted successfully.");
                } else {
                    console.error("Prompt textarea not found.");
                }
            })();
        `
    });
}

// Funkcja klikająca przycisk "Generate"
async function clickGenerateButton(tabId) {
    console.log("Clicking Generate button...");
    await browser.tabs.executeScript(tabId, {
        code: `
            (function() {
                const generateButton = Array.from(document.querySelectorAll('button'))
                    .find(button => button.textContent.includes("Generate"));
                if (generateButton) {
                    generateButton.click();
                    console.log("Generate button clicked.");
                } else {
                    console.error("Generate button not found.");
                }
            })();
        `
    });
}

// Nasłuchiwanie wiadomości z popup.js
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "startIdeogramProcess") {
        console.log("Received request to start Ideogram AI process.");
        openIdeogramAndGenerate();
    }
});
