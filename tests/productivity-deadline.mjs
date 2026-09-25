import assert from "node:assert/strict";
import {deadlineInstant,deadlineLabel} from "../assets/js/deadline.js";

const at=value=>new Date(value);
assert.equal(deadlineInstant("2026-09-24")?.toISOString(),"2026-09-24T16:59:59.000Z");
assert.equal(deadlineInstant("2026-02-30"),null);
assert.equal(deadlineLabel(null),"Belum ada tenggat");
assert.equal(deadlineLabel("2026-09-24",{now:at("2026-09-24T03:00:00Z")}),"Berakhir hari ini");
assert.equal(deadlineLabel("2026-09-25",{now:at("2026-09-24T03:00:00Z")}),"Besok");
assert.equal(deadlineLabel("2026-09-27",{now:at("2026-09-24T03:00:00Z")}),"3 hari lagi");
assert.equal(deadlineLabel("2026-09-24T05:42:00Z",{now:at("2026-09-24T05:00:00Z")}),"42 menit lagi");
assert.equal(deadlineLabel("2026-09-24T10:00:00Z",{now:at("2026-09-24T05:00:00Z")}),"5 jam lagi");
assert.equal(deadlineLabel("2026-09-24",{now:at("2026-09-26T03:00:00Z")}),"Terlambat 2 hari");
assert.equal(deadlineLabel("2026-09-24",{done:true}),"Selesai");
console.log("PASS deadline parsing, Indonesian countdown, date-only Jakarta time, expiry, completion");
