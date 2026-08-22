import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../config/routes';
import { appConfig } from '../config/appConfig';
import { useSiteContext } from '../context/SiteContext';
import { getMediaUrl } from '../utils/media';

const Footer = () => {
  const { flattenedSettings } = useSiteContext();
  const appName = flattenedSettings.company_name || appConfig.appName;

  return (
    <footer className="bg-black border-t border-white/5 py-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            {flattenedSettings.logo_url ? (
              <img src={getMediaUrl(flattenedSettings.logo_url)} alt={`${appName} Logo`} className="h-12 w-auto object-contain mb-2" />
            ) : (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 bg-black border border-neon-cyan/50 rounded flex items-center justify-center">
                  <span className="text-neon-cyan font-bold text-xl uppercase">{appName.charAt(0)}</span>
                </div>
                <h2 className="text-white font-bold text-lg tracking-tight">{appName}</h2>
              </div>
            )}
            {flattenedSettings.company_email && <p className="text-zinc-400 text-xs mt-1">E: {flattenedSettings.company_email}</p>}
            {flattenedSettings.company_phone && <p className="text-zinc-400 text-xs mt-0.5">P: {flattenedSettings.company_phone}</p>}
            <p className="text-zinc-500 text-xs mt-2">&copy; {new Date().getFullYear()} {appName}. All rights reserved.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
            <Link to="#" className="hover:text-neon-cyan transition-colors">Privacy Policy</Link>
            <Link to="#" className="hover:text-neon-cyan transition-colors">Terms of Service</Link>
            <Link to={ROUTES.FAQ} className="hover:text-neon-cyan transition-colors">FAQ</Link>
            <Link to="#" className="hover:text-neon-cyan transition-colors">Careers</Link>
          </div>

          <div className="flex gap-4">
            {flattenedSettings.facebook_url && (
              <a href={flattenedSettings.facebook_url} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:border-neon-cyan hover:text-neon-cyan transition-all cursor-pointer">
                <span className="text-xs">FB</span>
              </a>
            )}
            {flattenedSettings.twitter_url && (
              <a href={flattenedSettings.twitter_url} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:border-neon-cyan hover:text-neon-cyan transition-all cursor-pointer">
                <span className="text-xs">X</span>
              </a>
            )}
            {flattenedSettings.instagram_url && (
              <a href={flattenedSettings.instagram_url} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:border-neon-cyan hover:text-neon-cyan transition-all cursor-pointer">
                <span className="text-xs">IG</span>
              </a>
            )}
            {flattenedSettings.linkedin_url && (
              <a href={flattenedSettings.linkedin_url} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:border-neon-cyan hover:text-neon-cyan transition-all cursor-pointer">
                <span className="text-xs">IN</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
