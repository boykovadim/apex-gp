CREATE TABLE rooms (id TEXT PRIMARY KEY, host TEXT NOT NULL, name TEXT NOT NULL, track TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 11, seen INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE pilots (id TEXT PRIMARY KEY, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, token TEXT NOT NULL, seen INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX pilots_room ON pilots(room,seen);
--> statement-breakpoint
CREATE TABLE packets (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, sender TEXT NOT NULL, seq INTEGER NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(sender,seq));
--> statement-breakpoint
CREATE INDEX room_packets ON packets(room,id);
