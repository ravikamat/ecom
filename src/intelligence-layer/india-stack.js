export class IndiaStack {
  static CLUSTERS = {
    textile:     ['Surat', 'Tirupur', 'Ludhiana'],
    garments:    ['Tirupur', 'Noida', 'Bangalore'],
    brass:       ['Moradabad'],
    electronics: ['Noida', 'Bangalore', 'Hyderabad'],
    jewelry:     ['Jaipur', 'Mumbai', 'Surat'],
    leather:     ['Kanpur', 'Kolkata', 'Agra'],
    furniture:   ['Jodhpur', 'Mumbai', 'Pune'],
    plastics:    ['Ahmedabad', 'Rajkot', 'Vadodara'],
  };

  static getClusters(category = '') {
    const key = Object.keys(this.CLUSTERS).find(k => category.toLowerCase().includes(k));
    return this.CLUSTERS[key] || ['Mumbai', 'Delhi', 'Bangalore'];
  }

  static generateWhatsAppLink(phone, message) {
    const clean   = String(phone).replace(/\D/g, '').replace(/^91/, '');
    const encoded = encodeURIComponent(message);
    return `https://wa.me/91${clean}?text=${encoded}`;
  }

  static generateHinglishMessage(company, product) {
    return `Namaste ${company} ji, hum ${product} ke liye sourcing kar rahe hain. Aapke MOQ aur price list share kar sakte hain?`;
  }

  static async lookupGST(brandName) {
    // Placeholder — integrate knowyourgst.com when GST_API_KEY is set
    return { brandName, status: 'api_not_configured', note: 'Set GST_API_KEY env var to enable' };
  }
}
