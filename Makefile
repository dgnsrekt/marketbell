UUID = marketbell@dgnsrekt.github.io
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SOURCES = extension.js prefs.js stylesheet.css metadata.json lib schemas
DOMAIN = marketbell
PO_FILES = $(wildcard po/*.po)
MO_FILES = $(patsubst po/%.po,locale/%/LC_MESSAGES/$(DOMAIN).mo,$(PO_FILES))

.PHONY: all schemas potfile mo pack install uninstall enable disable lint clean

all: schemas mo

schemas:
	glib-compile-schemas schemas/

# Regenerate the translation template after adding/changing _() strings.
potfile:
	xgettext --from-code=UTF-8 --language=JavaScript \
		--keyword=_ --keyword=gettext --package-name=MarketBell \
		--copyright-holder="dgnsrekt" --msgid-bugs-address="run2dos@gmail.com" \
		-o po/$(DOMAIN).pot extension.js prefs.js lib/*.js

# Compile every po/<lang>.po into locale/<lang>/LC_MESSAGES/marketbell.mo
mo: $(MO_FILES)

locale/%/LC_MESSAGES/$(DOMAIN).mo: po/%.po
	mkdir -p $(dir $@)
	msgfmt $< -o $@

pack: schemas
	gnome-extensions pack --force \
		--podir=po \
		--extra-source=lib \
		--extra-source=README.md \
		--extra-source=SPEC.md \
		--extra-source=LICENSE \
		.

install: schemas mo
	mkdir -p "$(INSTALL_DIR)"
	cp -r $(SOURCES) README.md SPEC.md LICENSE "$(INSTALL_DIR)/"
	@[ -d locale ] && cp -r locale "$(INSTALL_DIR)/" || true
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
	rm -rf locale
