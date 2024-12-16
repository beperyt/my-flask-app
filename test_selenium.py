from selenium import webdriver

# Tworzymy instancję przeglądarki Firefox
driver = webdriver.Firefox()

# Otwieramy stronę Google
driver.get("https://www.google.com")

# Wypisujemy tytuł strony, aby sprawdzić działanie
print("Tytuł strony:", driver.title)

# Zamykamy przeglądarkę
driver.quit()
