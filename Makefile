UUID = marketbell@dgnsrekt.github.io
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SOURCES = extension.js prefs.js stylesheet.css metadata.json lib schemas

.PHONY: all schemas pack install uninstall enable disable lint clean

all: schemas

schemas:
	glib-compile-schemas schemas/

pack: schemas
	gnome-extensions pack --force \
		--extra-source=lib \
		--extra-source=README.md \
		--extra-source=SPEC.md \
		--extra-source=LICENSE \
		.

install: schemas
	mkdir -p "$(INSTALL_DIR)"
	cp -r $(SOURCES) README.md SPEC.md LICENSE "$(INSTALL_DIR)/"
	@echo "Installed to $(INSTALL_DIR)"
	@echo "Restart GNOME Shell, then: gnome-extensions enable $(UUID)"

uninstall:
	rm -rf "$(INSTALL_DIR)"

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

clean:
	rm -f schemas/gschemas.compiled
	rm -f $(UUID).shell-extension.zip
