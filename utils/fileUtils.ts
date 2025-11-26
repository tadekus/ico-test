
import { FileData } from '../types';
import * as XLSX from 'xlsx';

export const readFile = (file: File): Promise<Omit<FileData, 'id' | 'status'>> => {
  return new Promise((resolve, reject) => {
    const fileType: 'pdf' | 'excel' | 'image' = file.name.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : file.name.toLowerCase().match(/\.(xlsx|xls|csv)$/)
      ? 'excel'
      : 'image';

    const reader = new FileReader();

    reader.onload = async (e) => {
      if (!e.target?.result) {
        reject(new Error("Failed to read file"));
        return;
      }
      
      const result = e.target.result as string; // Base64 string from readAsDataURL
      const base64Data = result.split(',')[1];

      if (fileType === 'excel') {
        try {
          const excelText = await parseExcel(file);
          resolve({
            file,
            type: 'excel',
            base64: base64Data, // Still keep base64 just in case
            textContent: excelText
          });
        } catch (err) {
          reject(err);
        }
      } else {
        resolve({
          file,
          type: fileType,
          base64: base64Data,
          preview: fileType === 'image' ? result : undefined
        });
      }
    };

    reader.onerror = () => reject(reader.error || new Error("Unknown FileReader error"));
    reader.readAsDataURL(file);
  });
};

const parseExcel = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (!e.target?.result) {
           reject(new Error("Failed to read Excel data"));
           return;
        }
        const data = e.target.result as string;
        const workbook = XLSX.read(data, { type: 'binary' });
        let combinedText = "Document Content (Excel Export):\n";

        workbook.SheetNames.forEach((sheetName: string) => {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          combinedText += `\n--- Sheet: ${sheetName} ---\n${csv}`;
        });

        resolve(combinedText);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Unknown Excel FileReader error"));
    reader.readAsBinaryString(file);
  });
};
