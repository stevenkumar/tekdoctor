'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProductCardV2 from './ProductCardV2';
import SearchFilter from './SearchFilter';
import InquirySidebar from './InquirySidebar';
import { ShoppingBag, ChevronRight, Info, X, ShieldCheck, Award, Zap } from 'lucide-react';

// Data imports - UPDATED PATHS for main components directory
import saleProducts from '../data/products_for_sale.json';
import rentProducts from '../data/products_for_rent.json';
import equipmentData from '../data/equipment.json';

export default function ShopDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All Products');
  const [activeMode, setActiveMode] = useState<'all' | 'sale' | 'rental'>('all');
  const [inquiryItems, setInquiryItems] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  // Combine and normalize data
  const allProducts = useMemo(() => {
    try {
      const normalizedSales = (saleProducts || []).map(p => ({ ...p, type: 'sale' }));
      const normalizedRentals = (rentProducts || []).map(p => ({ ...p, type: 'rental' }));
      
      // Add hardware inventory items
      const normalizedHardware = (equipmentData?.hardware || []).flatMap((cat: any) => 
        (cat.items || []).map((item: any) => ({
          ...item,
          id: item.id || `hw-${cat.id}-${item.name}`.replace(/\s+/g, '-'),
          category: cat.category,
          type: 'sale',
          price: item.price || 'Contact for Quote',
          description: item.description || `Use Case: ${item.useCase}`,
          highlights: item.highlights || [`In Stock: ${item.stock}`],
          specs: item.specs || 'Enterprise Standard Specifications'
        }))
      );

      // Add lab tools inventory items
      const normalizedTools = (equipmentData?.tools || []).map((tool: any) => ({
        ...tool,
        id: tool.id ? `tool-${tool.id}` : `tool-${tool.name}`.replace(/\s+/g, '-'),
        category: 'Lab Equipment',
        type: 'sale',
        price: 'Contact for Quote',
        description: tool.capabilities || tool.whyWUse,
        specs: `${tool.model} - ${tool.level} Precision`,
        highlights: [tool.precision, tool.whyWUse].filter(Boolean)
      }));

      return [...normalizedSales, ...normalizedRentals, ...normalizedHardware, ...normalizedTools];
    } catch (err) {
      console.error("Error normalizing product data:", err);
      return [];
    }
  }, []);

  // Filter products
  const filteredProducts = useMemo(() => {
    return allProducts.filter(p => {
      const name = (p.name || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const query = (searchQuery || '').toLowerCase();
      
      const matchesSearch = name.includes(query) || desc.includes(query);
      const matchesCategory = activeCategory === 'All Products' || p.category === activeCategory;
      const matchesMode = activeMode === 'all' || p.type === activeMode;
      
      return matchesSearch && matchesCategory && matchesMode;
    });
  }, [allProducts, searchQuery, activeCategory, activeMode]);

  const addToInquiry = (product: any) => {
    if (!product || !product.id) return;
    if (!inquiryItems.find(item => item.id === product.id)) {
      setInquiryItems([...inquiryItems, product]);
      setIsSidebarOpen(true);
    }
  };

  const removeFromInquiry = (id: string) => {
    setInquiryItems(inquiryItems.filter(item => item.id !== id));
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#050505] text-zinc-300 font-sans pb-24"
    >
      {/* Header Accent */}
      <div className="max-w-7xl mx-auto px-6 pt-12 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-l-4 border-neon-cyan pl-8 py-2">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">
              Technology <span className="text-neon-cyan">Inventory</span>
            </h1>
            <p className="mt-4 text-zinc-500 font-mono text-xs uppercase tracking-[0.3em] font-bold">
              Precision Diagnostic Tools & Enterprise Hardware Solutions
            </p>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="relative group p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-neon-cyan/50 transition-all active:scale-95"
          >
            <ShoppingBag size={24} className="text-white group-hover:text-neon-cyan" />
            {inquiryItems.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-neon-cyan text-black text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full shadow-lg shadow-neon-cyan/20">
                {inquiryItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Filter Section */}
        <SearchFilter 
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          activeMode={activeMode}
          setActiveMode={setActiveMode}
        />

        {/* Main Grid */}
        <motion.div 
          layout
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-8"
        >
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product) => (
              <motion.div
                key={product.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
              >
                <ProductCardV2 
                  product={product} 
                  mode={product.type as 'sale' | 'rental'}
                  onInquiry={addToInquiry}
                  onViewDetails={setSelectedProduct}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Lab Tools Spotlight */}
        <div className="mt-24 space-y-8">
           <div className="flex items-center gap-4">
              <Zap className="text-neon-cyan" size={24} />
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Our <span className="text-zinc-500">Lab Diagnostics</span> Tooling</h2>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {equipmentData.tools.map((tool) => (
                <div key={tool.id} className="p-6 bg-zinc-900/20 border border-zinc-800 rounded-[2rem] hover:border-zinc-700 transition-all group">
                   <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-mono text-neon-cyan font-bold uppercase tracking-widest px-2 py-1 bg-neon-cyan/10 rounded-lg">{tool.level}</span>
                      <ShieldCheck size={18} className="text-zinc-700 group-hover:text-neon-cyan transition-colors" />
                   </div>
                   <h4 className="text-lg font-bold text-white mb-2">{tool.name}</h4>
                   <p className="text-xs text-zinc-500 font-mono mb-4">{tool.model}</p>
                   <p className="text-sm text-zinc-400 mb-4 leading-relaxed">{tool.capabilities}</p>
                   <div className="pt-4 border-t border-zinc-800/50">
                      <p className="text-[11px] text-zinc-500 italic"><span className="text-neon-cyan/60 not-italic font-bold">Use Case:</span> {tool.whyWUse}</p>
                   </div>
                </div>
              ))}
           </div>
        </div>

        {/* Certifications Footer */}
        {/* <div className="mt-24 py-12 border-t border-zinc-900 flex flex-wrap justify-center gap-8 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-700">
           {equipmentData.certifications.map((cert, idx) => (
             <div key={idx} className="flex flex-col items-center gap-2">
                <Award size={32} className="text-neon-cyan" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-300">{cert.name}</span>
             </div>
           ))}
        </div> */}

        {/* Empty State */}
        {filteredProducts.length === 0 && (
          <div className="py-32 flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-[2rem]">
              <ShoppingBag size={48} className="text-zinc-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">No items found</p>
              <p className="text-sm text-zinc-500">Try adjusting your filters or search query</p>
            </div>
            <button 
              onClick={() => { setSearchQuery(''); setActiveCategory('All Products'); setActiveMode('all'); }}
              className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Inquiry Sidebar */}
      <InquirySidebar 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        items={inquiryItems}
        onRemove={removeFromInquiry}
        onClear={() => setInquiryItems([])}
      />

      {/* Product Detail Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-950 border border-zinc-800 rounded-[2.5rem] max-w-3xl w-full p-10 relative max-h-[90vh] overflow-y-auto shadow-2xl shadow-neon-cyan/10"
            >
              <button
                onClick={() => setSelectedProduct(null)}
                title="Close product details"
                className="absolute top-8 right-8 p-3 text-zinc-500 hover:text-white bg-zinc-900 border border-zinc-800 rounded-2xl transition-all"
              >
                <X size={20} />
              </button>

              <div className="space-y-8">
                <div className="space-y-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] border ${
                    selectedProduct.type === 'rental' ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
                  }`}>
                    {selectedProduct.type === 'rental' ? 'Managed Rental' : 'Purchase Inventory'}
                  </span>
                  <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">
                    {selectedProduct.name}
                  </h2>
                  <p className="text-3xl font-black text-neon-cyan">{selectedProduct.price || selectedProduct.weeklyPrice}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Product Description</h4>
                      <p className="text-zinc-400 text-sm leading-relaxed">{selectedProduct.description}</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Tech Specifications</h4>
                      <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl text-zinc-300 text-xs font-mono leading-relaxed">
                        {selectedProduct.specs}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Key Highlights</h4>
                      <div className="grid gap-3">
                        {selectedProduct.highlights?.map((h: string, i: number) => (
                          <div key={i} className="flex items-center gap-3 text-xs text-zinc-300 bg-zinc-900/30 p-3 rounded-xl border border-zinc-800/50">
                            <Info size={14} className="text-neon-cyan" />
                            {h}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => { addToInquiry(selectedProduct); setSelectedProduct(null); }}
                      className="w-full py-4 bg-white text-black font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl hover:bg-neon-cyan transition-all flex items-center justify-center gap-3"
                    >
                      Add to Inquiry Bundle
                      <ShoppingBag size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
