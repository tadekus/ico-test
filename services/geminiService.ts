
import { GoogleGenAI, Type } from "@google/genai";
import { FileData, ExtractionResult } from "../types";

const SYSTEM_INSTRUCTION = `
You are a specialized data extraction assistant for Czech invoices (faktury). 
Your goal is to identify and extract key business and financial details from the document.

FIELDS TO EXTRACT:

1. **IČO (Business ID)**: 
   - Look for labels like "IČO", "IČ", "Identifikační číslo", "Reg. No.".
   - Standard Czech IČO is an 8-digit number.
   - **Important**: If you see an ID labeled as IČ/IČO that has FEWER than 8 digits (e.g., 12345), extract it exactly as is.
   - Prefer the SUPPLIER'S IČO (Dodavatel).

2. **Company Name**: 
   - Extract the full legal name of the supplier.

3. **Bank Details**:
   - Look for "Číslo účtu", "Účet", "Bankovní spojení".
   - Look for "IBAN".

4. **Payment Details**:
   - **Variable Symbol (VS)**: Look for "Variabilní symbol", "VS". This is crucial.
   - **Description**: Summarize "What is being invoiced" in 3-5 words (e.g., "Camera rental", "Catering services", "Location fee").

5. **Amounts & Currency**:
   - **Total Amount (With VAT/DPH)**: Look for "Celkem k úhradě", "Částka celkem", "S DPH", "Total".
   - **Base Amount (Without VAT/DPH)**: Look for "Základ daně", "Bez DPH", "Netto".
   - **Currency**: Detect the currency. **ALWAYS Normalize "Kč" to "CZK".**

FORMATTING RULES:
- Return amounts as raw numbers (e.g. 1250.50). Do not include currency symbols in the number fields.
- If a specific field is not found, set it to null.
- Return the result in strict JSON format.
`;

export const extractIcoFromDocument = async (fileData: FileData): Promise<ExtractionResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please set the API_KEY environment variable.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Schema for structured output
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      ico: { type: Type.STRING, description: "The IČO number. Can be 8 digits or fewer." },
      companyName: { type: Type.STRING, description: "The full legal name of the supplier company." },
      bankAccount: { type: Type.STRING, description: "Local bank account number." },
      iban: { type: Type.STRING, description: "International Bank Account Number (IBAN)." },
      variableSymbol: { type: Type.STRING, description: "Variable symbol (VS) for payment." },
      description: { type: Type.STRING, description: "Short description of the service or goods." },
      amountWithVat: { type: Type.NUMBER, description: "Total amount including VAT." },
      amountWithoutVat: { type: Type.NUMBER, description: "Amount excluding VAT (Tax Base)." },
      currency: { type: Type.STRING, description: "Currency code (normalize to CZK if Kč)." },
      confidence: { type: Type.NUMBER, description: "Confidence score between 0 and 1." },
      rawText: { type: Type.STRING, description: "A brief snippet of text where the IČO was found." }
    },
    required: ["confidence"],
  };

  try {
    let parts: any[] = [];

    if (fileData.type === 'excel' && fileData.textContent) {
      // For Excel, we use the parsed text content
      parts = [{ text: fileData.textContent }];
    } else {
      // For PDF and Images, we use inlineData
      const mimeType = fileData.type === 'pdf' ? 'application/pdf' : fileData.file.type;
      if (!fileData.base64) throw new Error("File data missing");
      
      parts = [
        {
          inlineData: {
            mimeType: mimeType,
            data: fileData.base64
          }
        },
        {
          text: "Extract IČO, Company Name, Bank Details, VS, Description and Amounts from this invoice."
        }
      ];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1, // Low temperature for factual extraction
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from AI");
    }

    const result = JSON.parse(text) as ExtractionResult;
    return result;

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};
