
export interface ParsedBudgetLine {
    account_number: string;
    account_description: string;
    category_number: string;
    category_description: string;
    original_amount: number;
}

export const parseBudgetXml = (xmlContent: string): ParsedBudgetLine[] => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    
    // 1. Parse Categories
    const categoryMap = new Map<string, { number: string, description: string }>();
    const categories = xmlDoc.getElementsByTagName('category');
    
    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        const cID = cat.getElementsByTagName('cID')[0]?.textContent || '';
        const cNumber = cat.getElementsByTagName('cNumber')[0]?.textContent || '';
        const cDescription = cat.getElementsByTagName('cDescription')[0]?.textContent || '';
        
        if (cID) {
            categoryMap.set(cID, { number: cNumber, description: cDescription });
        }
    }

    // 2. Parse Accounts
    const accounts = xmlDoc.getElementsByTagName('account');
    const lines: ParsedBudgetLine[] = [];

    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const catID = acc.getElementsByTagName('categoryID')[0]?.textContent || '';
        const aNumber = acc.getElementsByTagName('aNumber')[0]?.textContent || '';
        const aDescription = acc.getElementsByTagName('aDescription')[0]?.textContent || '';
        const aTotalStr = acc.getElementsByTagName('aTotal')[0]?.textContent || '0';
        
        const aTotal = parseFloat(aTotalStr);
        const category = categoryMap.get(catID);

        // Filter out empty lines or structure headers if needed, 
        // typically valid lines have a number.
        if (aNumber && category) {
            lines.push({
                account_number: aNumber,
                account_description: aDescription,
                category_number: category.number,
                category_description: category.description,
                original_amount: aTotal
            });
        }
    }

    return lines;
};
