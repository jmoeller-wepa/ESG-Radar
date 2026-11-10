update-40: Kundennews nicht mehr automatisch in Climate & Energy

Hochladen (nur diese 2 Dateien, data/ bleibt unangetastet):
  scripts/collect_feeds.py  -> Ordner scripts/
  config/feeds.json         -> Ordner config/

Wirkung: Beim nächsten Workflow-Lauf werden alle bestehenden Kundennews neu getaggt.
Ein Kunden-Artikel bekommt Climate & Energy nur noch bei echten Klima-/Energiebegriffen
(CO2, Emissionen, Scope 3, Klimaziel, Klimaschutz, Net Zero, SBTi, erneuerbare Energie ...).
Sonst hat er keinen Bereich und erscheint weiter unter "All news" und "our customers".
Keine HTML-Änderung, daher kein neuer ?v=-Stand nötig.
