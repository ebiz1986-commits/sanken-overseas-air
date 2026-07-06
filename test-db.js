import * as fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf8"));
const { projectId, apiKey, firestoreDatabaseId } = firebaseConfig;
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents:runQuery?key=${apiKey}`;

const body = {
  structuredQuery: {
    from: [{ collectionId: "tickets" }]
  }
};

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
})
  .then(async res => {
    const results = await res.json();
    if (!Array.isArray(results)) {
      console.log("No tickets array found:", results);
      return;
    }
    const tickets = [];
    for (const item of results) {
      if (item.document) {
        const fields = item.document.fields || {};
        const parsed = {
          id: item.document.name.split('/').pop()
        };
        for (const [k, v] of Object.entries(fields)) {
          if (v.stringValue !== undefined) parsed[k] = v.stringValue;
          else if (v.booleanValue !== undefined) parsed[k] = v.booleanValue;
          else if (v.integerValue !== undefined) parsed[k] = parseInt(v.integerValue, 10);
          else if (v.doubleValue !== undefined) parsed[k] = parseFloat(v.doubleValue);
          else if (v.timestampValue !== undefined) parsed[k] = v.timestampValue;
          else if (v.nullValue !== undefined) parsed[k] = null;
        }
        tickets.push(parsed);
      }
    }

    console.log(`po_status is 'pending po approval' and stage3_completed !== true: `, tickets.filter(t => t.po_status === 'pending po approval' && !t.stage3_completed).length);
    console.log(`po_status is 'pending po approval': `, tickets.filter(t => t.po_status === 'pending po approval').length);
    console.log(`po_status is not 'payment done' and stage2_completed: `, tickets.filter(t => t.po_status !== 'payment done' && t.stage2_completed).length);
    console.log(`t.stage2_completed && !t.stage3_completed and has first_invoice_number: `, tickets.filter(t => t.stage2_completed && !t.stage3_completed && t.first_invoice_number).length);
    console.log(`t.stage2_completed && !t.stage3_completed and has first_invoice: `, tickets.filter(t => t.stage2_completed && !t.stage3_completed && t.first_invoice).length);
    console.log(`t.stage2_completed && !t.stage3_completed and has po_status: `, tickets.filter(t => t.stage2_completed && !t.stage3_completed && t.po_status).length);
    
    // Let's also check ticket fields for 'assigned_to':
    console.log("Unknown tickets:", tickets.filter(t => !t.status).map(t => ({ id: t.id, title: t.title })));
  })
  .catch(err => {
    console.error("Fetch failed:", err);
  });
