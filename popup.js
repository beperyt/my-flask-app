document.addEventListener("DOMContentLoaded", () => {
    console.log("Popup script loaded.");

    const analyzeButton = document.getElementById("analyze-design");
    const clearStorageButton = document.getElementById("clear-storage");
    const importedDesignsContainer = document.getElementById("imported-designs");
    const notification = document.getElementById("notification");

    let db;

    // Initialize IndexedDB
    function initializeDatabase() {
        const request = indexedDB.open("DesignDatabase", 1);

        request.onupgradeneeded = (event) => {
            db = event.target.result;

            if (!db.objectStoreNames.contains("designs")) {
                const objectStore = db.createObjectStore("designs", { keyPath: "id" });
                objectStore.createIndex("title", "title", { unique: false });
                objectStore.createIndex("brand", "brand", { unique: false });
                console.log("Object store for designs created.");
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("Database initialized.");
            loadDesigns();
        };

        request.onerror = (event) => {
            console.error("Database error:", event.target.errorCode);
        };
    }

    // Fetch all designs from IndexedDB
    function getAllDesignsFromDB() {
        return new Promise((resolve, reject) => {
            if (!db) {
                console.error("Database is not initialized.");
                reject("Database not initialized");
                return;
            }

            const transaction = db.transaction(["designs"], "readonly");
            const objectStore = transaction.objectStore("designs");
            const request = objectStore.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // Delete a design from IndexedDB
    function deleteDesignFromDB(id) {
        const transaction = db.transaction(["designs"], "readwrite");
        const objectStore = transaction.objectStore("designs");
        const request = objectStore.delete(id);

        request.onsuccess = () => {
            console.log(`Design with ID ${id} deleted.`);
            loadDesigns();
        };

        request.onerror = (event) => {
            console.error(`Error deleting design with ID ${id}:`, event.target.error);
        };
    }

    // Analyze design via background script
    function analyzeDesign(design) {
        console.log(`Sending analyze request for design ID: ${design.id}`);
        browser.runtime.sendMessage({ action: "analyzeDesigns" })
            .then((response) => {
                console.log("Analysis request completed:", response);
                loadDesigns();
            })
            .catch((error) => {
                console.error("Error analyzing design:", error);
            });
    }

    // Render designs in the UI
    function renderDesigns(designs) {
        importedDesignsContainer.innerHTML = "";
        if (designs.length === 0) {
            importedDesignsContainer.innerHTML =
                '<p class="empty-message hidden">No designs imported yet.</p>';
            return;
        }

        designs.forEach((design) => {
            const designItem = document.createElement("div");
            designItem.className = "design-item";

            designItem.innerHTML = `
                <div class="design-content">
                    <img src="${design.images[0]}" alt="Design Thumbnail" class="thumbnail">
                    <div class="design-info">
                        <strong>${design.title}</strong><br>
                        <em>Brand: ${design.brand}</em><br>
                        <span>Product URL: <a href="${design.productUrl}" target="_blank">${design.productUrl}</a></span><br>
                        <span>Image URL: <button class="copy-image-url" data-url="${design.images[0]}">Copy Image URL</button></span><br>
                        <span class="status">${design.prompt ? "Analyzed" : "Pending Analysis"}</span>
                        ${design.prompt ? `<p class="prompt">${design.prompt}</p>` : ""}
                    </div>
                </div>
                <div class="action-buttons">
                    <button class="delete-design" data-id="${design.id}">Delete</button>
                    <button class="analyze-design" data-id="${design.id}">Analyze</button>
                </div>
            `;

            importedDesignsContainer.appendChild(designItem);

            // Add event listeners for buttons
            designItem.querySelector(".delete-design").addEventListener("click", (event) => {
                const designId = event.target.dataset.id;
                deleteDesignFromDB(designId);
            });

            designItem.querySelector(".analyze-design").addEventListener("click", () => {
                analyzeDesign(design);
            });

            designItem.querySelector(".copy-image-url").addEventListener("click", (event) => {
                const imageUrl = event.target.dataset.url;
                navigator.clipboard.writeText(imageUrl).then(() => {
                    console.log("Image URL copied to clipboard.");
                    alert("Image URL copied!");
                }).catch((error) => {
                    console.error("Error copying image URL:", error);
                });
            });
        });
    }

    // Load designs from IndexedDB and render them
    function loadDesigns() {
        getAllDesignsFromDB()
            .then((designs) => renderDesigns(designs))
            .catch((error) => console.error("Error loading designs:", error));
    }

    if (clearStorageButton) {
        clearStorageButton.addEventListener("click", () => {
            const transaction = db.transaction(["designs"], "readwrite");
            transaction.objectStore("designs").clear();
            transaction.oncomplete = () => loadDesigns();
        });
    }

    initializeDatabase();
});
