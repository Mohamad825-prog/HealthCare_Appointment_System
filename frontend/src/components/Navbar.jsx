import React, { useEffect } from 'react'
import { navbarStyles } from '../assets/dummyStyles'
import { useRef, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { SignedIn, SignedOut, useAuth, useClerk, UserButton } from '@clerk/clerk-react'
import { User } from 'lucide-react'
import logo from '../assets/logo.png'
import { Key } from 'lucide-react'
import { Menu, X } from 'lucide-react'
import { DOCTOR_AUTH_EVENT, DOCTOR_TOKEN_STORAGE_KEY, getDoctorToken } from '../utils/doctorAuth'

const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [showNavbar, setShowNavbar] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);
    const [isDoctorLoggedIn, setIsDoctorLoggedIn] = useState(() => {
        try {
            return Boolean(getDoctorToken());
        } catch {
            return false;
        }
    });
    const location = useLocation();
    const navRef = useRef(null);
    const clerk = useClerk();
    const { isSignedIn } = useAuth();


    // Hide and show navbar on scroll
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            if (currentScrollY > lastScrollY && currentScrollY > 80) {
                setShowNavbar(false);
            } else {
                setShowNavbar(true);
            }
            setLastScrollY(currentScrollY);
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [lastScrollY]);

    // Sync the doctor login state
    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === DOCTOR_TOKEN_STORAGE_KEY) {
                setIsDoctorLoggedIn(Boolean(e.newValue));
            }
        };
        const onDoctorAuthChange = () => {
            setIsDoctorLoggedIn(Boolean(getDoctorToken()));
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener(DOCTOR_AUTH_EVENT, onDoctorAuthChange);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(DOCTOR_AUTH_EVENT, onDoctorAuthChange);
        };
    }, []);

    // Close mobile menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isOpen && navRef.current && !navRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const navItems = [
        { label: "Home", href: "/" },
        { label: "Doctors", href: "/doctors" },
        { label: "Services", href: "/services" },
        { label: "Appointments", href: "/appointments" },
        { label: "Contact", href: "/contact" },
    ];
    if (isSignedIn) {
        navItems.splice(4, 0, { label: "My Profile", href: "/profile" });
    }
    const doctorAdminHref = isDoctorLoggedIn
        ? "/doctor-admin/dashboard"
        : "/doctor-admin/login";



    return (
        <>
            <div className={navbarStyles.navbarBorder}></div>

            <nav ref={navRef}
                className={`${navbarStyles.navbarContainer} ${showNavbar ? navbarStyles.navbarVisible : navbarStyles.navbarHidden
                    }`}>
                <div className={navbarStyles.contentWrapper}>
                    <div className={navbarStyles.flexContainer}>
                        {/* Logo and Title */}
                        <Link to='/' className={navbarStyles.logoLink}>
                            <div className={navbarStyles.logoContainer}>
                                <div className={navbarStyles.logoImageWrapper}>
                                    <img src={logo} alt='logo' className={navbarStyles.logoImage}
                                    />
                                </div>
                            </div>
                            <div className={navbarStyles.logoTextContainer}>
                                <h1 className={navbarStyles.logoTitle}>
                                    HealthCare Appointments
                                </h1>
                                <p className={navbarStyles.logoSubtitle}>
                                    Your trusted partner in healthcare
                                </p>
                            </div>
                        </Link>

                        <div className={navbarStyles.desktopNav}>
                            <div className={navbarStyles.navItemsContainer}>
                                {navItems.map((item) => {
                                    const isActive = location.pathname === item.href;
                                    return (
                                        <Link key={item.href} to={item.href}
                                            className={`${navbarStyles.navItem} ${isActive ? navbarStyles.navItemActive : navbarStyles.navItemInactive}`}>
                                            {item.label}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Right Side */}
                        <div className={navbarStyles.rightContainer}>
                            <Link to={doctorAdminHref} className={navbarStyles.doctorAdminButton}>
                                <User className={navbarStyles.doctorAdminIcon} />
                                <span className={navbarStyles.doctorAdminText}>
                                    {isDoctorLoggedIn ? "Doctor Portal" : "Doctor Admin"}
                                </span>
                            </Link>

                            <SignedOut>
                                {/* Patient Login */}
                                <button onClick={() => clerk.openSignIn()}
                                    className={navbarStyles.loginButton}>
                                    <Key className={navbarStyles.loginIcon} />
                                    Login
                                </button>
                            </SignedOut>

                            <SignedIn>
                                <UserButton afterSignOutUrl="/" />
                            </SignedIn>

                            {/* To Toggle Mobile Menu */}
                            <button onClick={() => setIsOpen(!isOpen)} className={navbarStyles.mobileToggle}>
                                {isOpen ? (
                                    <X className={navbarStyles.toggleIcon} />
                                ) : (
                                    <Menu className={navbarStyles.toggleIcon} />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Mobile Navigation Menu */}
                    {isOpen && (
                        <div className={navbarStyles.mobileMenu}>
                            {navItems.map((item, idx) => {
                                const isActive = location.pathname === item.href;
                                return (
                                    <Link key={idx} to={item.href}
                                        onClick={() => setIsOpen(false)}
                                        className={`${navbarStyles.mobileMenuItem} ${isActive ? navbarStyles.mobileMenuItemActive
                                            : navbarStyles.mobileMenuItemInactive}`}
                                    >
                                        {item.label}
                                    </Link>
                                )
                            })}

                            <Link to={doctorAdminHref} className={navbarStyles.mobileDoctorAdminButton}
                                onClick={() => setIsOpen(false)}>
                                {isDoctorLoggedIn ? "Doctor Portal" : "Doctor Admin"}
                            </Link>

                            <SignedOut>
                                <div className={navbarStyles.mobileLoginContainer}>
                                    <button onClick={() => {
                                        setIsOpen(false);
                                        clerk.openSignIn()
                                    }} className={navbarStyles.mobileLoginButton}>
                                        Login
                                    </button>
                                </div>
                            </SignedOut>
                        </div>
                    )}
                </div>

                <style>{navbarStyles.animationStyles}</style>
            </nav>
        </>
    );
};

export default Navbar;
