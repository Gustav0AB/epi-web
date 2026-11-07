import assert from "node:assert";
import { parseCsv } from "./csv.js";

const basic = parseCsv("externalId,maxScore\nq1,5\nq2,10");
assert.equal(basic.length, 2);
assert.deepEqual(basic[0], { externalId: "q1", maxScore: "5" });

const quoted = parseCsv('externalId,text\nq1,"Hola, mundo"\nq2,"Dijo ""hola"""');
assert.equal(quoted[0]!.text, "Hola, mundo");
assert.equal(quoted[1]!.text, 'Dijo "hola"');

const crlf = parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n");
assert.equal(crlf.length, 2);
assert.deepEqual(crlf[1], { a: "3", b: "4" });

const missing = parseCsv("a,b,c\n1,2");
assert.deepEqual(missing[0], { a: "1", b: "2", c: "" });

console.log("✓ csv self-check passed");

assert.deepEqual(parseCsv("\uFEFFa,b\r\n1,2", { strict: true, requiredHeaders: ["a"] }), [{ a: "1", b: "2" }]);
assert.deepEqual(parseCsv('a,b\n"one\ntwo","say ""hi"""', { strict: true }), [{ a: "one\ntwo", b: 'say "hi"' }]);
for (const invalid of ['a,b\n"unclosed,2', 'a,b\n"one"x,2', 'a,b\none"two,2', 'a,a\n1,2', 'a,\n1,2', 'a,b\n1,2,3']) {
  assert.throws(() => parseCsv(invalid, { strict: true }));
}
assert.throws(() => parseCsv("a,b\n1,2", { requiredHeaders: ["missing"] }));
assert.throws(() => parseCsv("", { strict: true, requiredHeaders: ["externalId"] }));
