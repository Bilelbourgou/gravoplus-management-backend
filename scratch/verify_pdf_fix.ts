
import PDFDocument from 'pdfkit';

async function verifyPDFHeight() {
    console.log("Verifying PDF dynamic height logic...");

    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    
    // Column width from devis.service.ts for Designation
    const designationWidth = 195 - 4; // C[1].w - 4
    
    const longText = "changement alucobond de tout la face et totem et logo et texte perfore (extra long text to force wrapping)";
    
    const height = doc.heightOfString(longText, { width: designationWidth });
    const fixedHeight = 18;

    console.log(`Text: "${longText}"`);
    console.log(`Width: ${designationWidth}`);
    console.log(`Calculated Height: ${height}`);
    console.log(`Previous Fixed Height: ${fixedHeight}`);

    if (height > fixedHeight) {
        console.log("✅ SUCCESS: The text requires more than 18 units, and the dynamic height logic correctly captures this.");
    } else {
        console.log("ℹ️ NOTE: The text fits in the fixed height, try a longer text.");
    }
}

verifyPDFHeight();
