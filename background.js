// Logowanie uruchomienia skryptu tła
console.log("Background script loaded.");

// Tworzenie pozycji w menu kontekstowym
browser.contextMenus.create({
  id: "importDesign",
  title: "Import Design",
  contexts: ["all"]
});
console.log("Context menu item 'Import Design' created.");

// Globalna baza danych IndexedDB
let db;

// Inicjalizacja IndexedDB
async function initializeDatabase() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open("DesignDatabase", 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("designs")) {
        db.createObjectStore("designs", { keyPath: "id" });
        console.log("Created object store for designs.");
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("Database initialized.");
      resolve(db);
    };

    request.onerror = (event) => {
      console.error("Error initializing IndexedDB:", event.target.error);
      reject(event.target.error);
    };
  });
}

// Uniwersalna funkcja dla transakcji IndexedDB
async function performTransaction(storeName, mode, callback) {
  try {
      const db = await initializeDatabase(); // Zainicjuj bazę danych
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);

      return new Promise((resolve, reject) => {
          // Uruchom zapytanie
          const request = callback(store);

          // Obsługa wyniku zapytania
          request.onsuccess = () => {
              console.log(`Transaction on '${storeName}' succeeded.`);
              resolve(request.result); // Zwróć wynik
          };

          // Obsługa błędów zapytania
          request.onerror = (event) => {
              console.error(`Error during transaction on '${storeName}':`, event.target.error);
              reject(event.target.error); // Przerwij z błędem
          };

          // Logowanie zakończenia transakcji
          transaction.oncomplete = () => {
              console.log(`Transaction on '${storeName}' completed successfully.`);
          };

          // Obsługa błędu transakcji
          transaction.onerror = (event) => {
              console.error(`Transaction error on '${storeName}':`, event.target.error);
              reject(event.target.error); // Przerwij z błędem
          };
      });
  } catch (error) {
      console.error(`Error initializing database for transaction on '${storeName}':`, error);
      throw error; // Ponownie zgłoś błąd
  }
}

// Obsługa kliknięcia w menu kontekstowym
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "importDesign") {
    console.log("Importing design...");
    browser.tabs.executeScript(tab.id, {
      code: `
        (function() {
          const imageUrl = document.querySelector("#imgTagWrapperId img")?.src || null;
          const title = document.querySelector("#productTitle")?.textContent.trim() || null;
          const brand = document.querySelector("#bylineInfo")?.textContent.trim() || null;
          const productUrl = window.location.href || null; // Pobranie URL strony produktu
          return { imageUrl, title, brand, productUrl };
        })();
      `
    }).then((results) => {
      const data = results[0];
      if (!data || !data.imageUrl || !data.title || !data.brand || !data.productUrl) {
        console.error("Invalid or missing data retrieved from executeScript:", data);
        return;
      }

      saveImportedDesign(data);
    }).catch((error) => console.error("Error executing script:", error));
  }
});

// Zapisanie importowanego designu do IndexedDB
async function saveImportedDesign({ imageUrl, title, brand, productUrl }) {
  try {
    const designs = await performTransaction("designs", "readonly", (store) => store.getAll());
    const existingDesign = designs.find((design) => design.productUrl === productUrl);

    if (existingDesign) {
      console.warn("Design already exists and will not be added again.");
      return;
    }

    const designId = `design-${Date.now()}`;
    const designData = {
      id: designId,
      title,
      brand,
      productUrl,
      images: [imageUrl], // Zapisujemy publiczny URL
      prompt: null,
      newDesigns: []
    };

    await saveDesignToDB(designData);
    console.log(`Design imported: ${title}`);
  } catch (error) {
    console.error("Error importing design:", error);
  }
}

// Zapisanie designu do IndexedDB
function saveDesignToDB(designData) {
  return performTransaction("designs", "readwrite", (store) => store.put(designData))
    .then(() => console.log(`Design saved to IndexedDB: ${designData.id}`))
    .catch((error) => console.error("Error saving design to IndexedDB:", error));
}

// Funkcja do analizy designów z obsługą image-to-text
async function fetchPromptFromOpenAIWithImage(imageUrl) {
  const apiKey = "apikey"; // Wstaw swój klucz API
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Give a prompt create design like this. Must be similar in the same style with clean black background easy to delete. Important focus on the text if exist, must be the same like on image. Your answer must be only prompt about graphic don't write about t-shirt. Only prompt with graphic description!" },
        { type: "image_url", image_url: { url: imageUrl } }
      ],
    },
  ];

  try {
    console.log("Sending request to OpenAI Vision API...");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 500
      })
    });

    const data = await response.json();
    console.log("Response from OpenAI:", data);

    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content.trim();
    } else {
      console.error("No valid response from OpenAI:", data);
      return "No prompt generated.";
    }
  } catch (error) {
    console.error("Error fetching prompt from OpenAI:", error);
    throw error;
  }
}

// Funkcja do analizy designów
async function analyzeDesigns() {
  try {
    const designs = await performTransaction("designs", "readonly", (store) => store.getAll());

    const analyzePromises = designs.map(async (design) => {
      if (!design.prompt) {
        console.log(`Analyzing design: ${design.title}`);
        try {
          design.prompt = await fetchPromptFromOpenAIWithImage(design.images[0]);
          await saveDesignToDB(design);
        } catch (error) {
          console.error(`Error generating prompt for ${design.title}:`, error);
        }
      }
    });

    await Promise.all(analyzePromises);
    console.log("All prompts generated and saved.");
  } catch (error) {
    console.error("Error analyzing designs:", error);
  }
}

// Listener na `runtime.onMessage`
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzeDesigns") {
    console.log("Received request to analyze designs.");
    analyzeDesigns()
      .then(() => sendResponse({ status: "analyzing" }))
      .catch((error) => sendResponse({ status: "error", error: error.message }));
    return true; // Asynchroniczna odpowiedź
  }

  if (message.action === "startIdeogramProcess") {
    console.log("Starting Ideogram process for project:", message.project);
    openIdeogram(message.project)
      .then(() => sendResponse({ status: "started" }))
      .catch((error) => sendResponse({ status: "error", error: error.message }));
    return true;
  }
});

// Funkcja do obsługi Ideogram
async function openIdeogram(project) {
  const ideogramUrl = "https://ideogram.ai/"; // Przykładowy URL Ideogram
  console.log("Opening Ideogram for project:", project.title);

  const tabs = await browser.tabs.query({ url: "*://ideogram.ai/*" });

  if (tabs.length > 0) {
    console.log("Switching to existing Ideogram tab...");
    await browser.tabs.update(tabs[0].id, { active: true });
  } else {
    console.log("Opening new Ideogram tab...");
    await browser.tabs.create({ url: ideogramUrl });
  }
  async function getPromptFromDB(projectId) {
    return performTransaction("designs", "readonly", (store) => store.get(projectId))
        .then((design) => design?.prompt || null)
        .catch((error) => {
            console.error("Error fetching prompt from IndexedDB:", error);
            return null;
        });
}

  // Możesz tutaj dodać logikę automatycznego wypełniania promptu, jeśli to możliwe.
}

// Prosty proces otwierania Creative Fabrica Studio
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzeDesigns") {
      console.log("Received request to analyze designs.");
      analyzeDesigns()
          .then(() => sendResponse({ status: "analyzing" }))
          .catch((error) => sendResponse({ status: "error", error: error.message }));
      return true; // Asynchroniczna odpowiedź
  }

  if (message.action === "startIdeogramProcess") {
      console.log("Starting Ideogram process for project:", message.project);
      openIdeogram(message.project)
          .then(() => sendResponse({ status: "started" }))
          .catch((error) => sendResponse({ status: "error", error: error.message }));
      return true;
  }

  if (message.action === "runSelenium") {
      const projectId = message.projectId;
      const { exec } = require('child_process');
      
      // Uruchomienie Selenium jako procesu
      exec(`node runSelenium.js ${projectId}`, (error, stdout, stderr) => {
          if (error) {
              console.error(`Error executing Selenium: ${error}`);
              sendResponse({ status: 'error', message: error.message });
              return;
          }
          console.log(`Selenium output: ${stdout}`);
          sendResponse({ status: 'success', message: stdout });
      });
      return true; // Asynchronous response
  }

  if (message.action === "runPuppeteer") {
      const projectId = message.projectId;
      const { exec } = require('child_process');
      
      // Uruchomienie Puppeteer jako procesu
      exec(`node puppeteer/ideogram_puppeteer.js ${projectId}`, (error, stdout, stderr) => {
          if (error) {
              console.error(`Error executing Puppeteer: ${error.message}`);
              sendResponse({ status: 'error', message: error.message });
              return;
          }
          console.log(`Puppeteer output: ${stdout}`);
          sendResponse({ status: 'success', message: stdout });
      });
      return true; // Asynchronous response
  }
});
