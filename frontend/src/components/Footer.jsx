import React, { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import {
  Phone, Mail, MapPin, Send,
  Facebook, Twitter, Instagram, Linkedin, Youtube,
  Stethoscope, Activity, Heart,
} from 'lucide-react'
import { footerStyles as s } from '../assets/dummyStyles'
import logo from '../assets/logo.png'

const quickLinks = [
  { label: 'Home', href: '/' },
  { label: 'Doctors', href: '/doctors' },
  { label: 'Services', href: '/services' },
  { label: 'Appointments', href: '/appointments' },
  { label: 'Contact', href: '/contact' },
]

const serviceLinks = [
  'General Consultation',
  'Lab Tests',
  'Specialist Referrals',
  'Emergency Care',
  'Preventive Health',
  'Follow-up Care',
]

const socialLinks = [
  { icon: Facebook, href: '#', label: 'Facebook', colorClass: s.facebookColor },
  { icon: Twitter, href: '#', label: 'Twitter', colorClass: s.twitterColor },
  { icon: Instagram, href: '#', label: 'Instagram', colorClass: s.instagramColor },
  { icon: Linkedin, href: '#', label: 'LinkedIn', colorClass: s.linkedinColor },
  { icon: Youtube, href: '#', label: 'YouTube', colorClass: s.youtubeColor },
]

const Footer = () => {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const { isSignedIn } = useAuth()

  const visibleQuickLinks = isSignedIn
    ? [
        ...quickLinks.slice(0, 4),
        { label: 'My Profile', href: '/profile' },
        ...quickLinks.slice(4),
      ]
    : quickLinks

  const handleSubscribe = (e) => {
    e.preventDefault()
    if (email.trim()) {
      setSubscribed(true)
      setEmail('')
      setTimeout(() => setSubscribed(false), 4000)
    }
  }

  return (
    <footer className={s.footerContainer}>
      {/* Floating decorative icons */}
      <div className={s.floatingIcon1}>
        <Stethoscope className={s.stethoscopeIcon} />
      </div>
      <div className={s.floatingIcon2}>
        <Activity className={s.activityIcon} />
      </div>

      <div className={s.mainContent}>
        <div className={s.gridContainer}>

          {/* Company Info */}
          <div className={s.companySection}>
            <div className={s.logoContainer}>
              <div className={s.logoWrapper}>
                <div className={s.logoImageContainer}>
                  <img src={logo} alt="HealthCare Logo" className={s.logoImage} />
                </div>
              </div>
            </div>
            <h2 className={s.companyName}>HealthCare</h2>
            <p className={s.companyTagline}>Your trusted partner in healthcare</p>
            <p className={s.companyDescription}>
              Connecting patients with certified healthcare professionals for a
              healthier, happier life. Book appointments with ease, anytime,
              anywhere.
            </p>
            <div className={s.contactContainer}>
              <div className={s.contactItem}>
                <div className={s.contactIconWrapper}>
                  <Phone className={s.contactIcon} />
                </div>
                <span className={s.contactText}>+961 76 944 185</span>
              </div>
              <div className={s.contactItem}>
                <div className={s.contactIconWrapper}>
                  <Mail className={s.contactIcon} />
                </div>
                <span className={s.contactText}>contact@healthcare.com</span>
              </div>
              <div className={s.contactItem}>
                <div className={s.contactIconWrapper}>
                  <MapPin className={s.contactIcon} />
                </div>
                <span className={s.contactText}>Saida, Lebanon</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className={s.linksSection}>
            <h3 className={s.sectionTitle}>Quick Links</h3>
            <ul className={s.linksList}>
              {visibleQuickLinks.map((link) => (
                <li key={link.href} className={s.linkItem}>
                  <Link to={link.href} className={s.quickLink}>
                    <span className={s.quickLinkIconWrapper}>
                      <Heart className={s.quickLinkIcon} />
                    </span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div className={s.linksSection}>
            <h3 className={s.sectionTitle}>Our Services</h3>
            <ul className={s.linksList}>
              {serviceLinks.map((svc) => (
                <li key={svc} className={s.linkItem}>
                  <Link to="/services" className={s.serviceLink}>
                    <span className={s.serviceIcon} />
                    {svc}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter & Social */}
          <div className={s.newsletterSection}>
            <h3 className={s.newsletterTitle}>Stay Updated</h3>
            <p className={s.newsletterDescription}>
              Subscribe to our newsletter for the latest health tips and appointment
              updates.
            </p>

            <form onSubmit={handleSubscribe} className={s.newsletterForm}>
              {/* Mobile layout */}
              <div className={s.mobileNewsletterContainer}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  className={s.emailInput}
                />
                <button type="submit" className={s.mobileSubscribeButton}>
                  <Send className={s.mobileButtonIcon} />
                  {subscribed ? 'Subscribed!' : 'Subscribe'}
                </button>
              </div>

              {/* Desktop layout */}
              <div className={s.desktopNewsletterContainer}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  className={s.desktopEmailInput}
                />
                <button type="submit" className={s.desktopSubscribeButton}>
                  <Send className={s.desktopButtonIcon} />
                  <span className={s.desktopButtonText}>
                    {subscribed ? 'Done!' : 'Subscribe'}
                  </span>
                </button>
              </div>
            </form>

            {/* Social Links */}
            <div className={s.socialContainer}>
              {socialLinks.map(({ icon: Icon, href, label, colorClass }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className={`${s.socialLink} ${colorClass}`}
                >
                  <span className={s.socialIconBackground} />
                  {React.createElement(Icon, { className: s.socialIcon })}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className={s.bottomSection}>
          <p className={s.copyright}>
            <Heart className="w-4 h-4 text-rose-500 fill-rose-400" />
            © {new Date().getFullYear()} HealthCare Appointments. All rights reserved.
          </p>
          <p className={s.designerText}>
            Designed with care for better health outcomes.
          </p>
        </div>
      </div>

      <style>{s.animationStyles}</style>
    </footer>
  )
}

export default Footer
