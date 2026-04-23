import React from 'react'
import Navbar from '../components/Navbar'
import { heroStyles } from "../assets/dummyStyles";
import logoImg from "../assets/logo.png";

const Hero = ({ role = "admin", userName = "Doctor" }) => {
    const isDoctor = role === "doctor";

    return (
        <div className={heroStyles.container}>
            <Navbar />
            <main className={heroStyles.mainContainer}>
                <section className={heroStyles.section}>
                    <div className={heroStyles.decorativeBg.container}>
                        <div className={heroStyles.decorativeBg.blurBackground}>
                            <div className={heroStyles.decorativeBg.blurShape}></div>
                        </div>

                        <div className={heroStyles.contentBox}>
                            <div className={heroStyles.logoContainer}>
                                <img src={logoImg} alt="logo" className={heroStyles.logo} />
                            </div>

                            <h1 className={heroStyles.heading}>
                                {isDoctor
                                    ? `Welcome, Dr. ${userName}`
                                    :  "Welcome to the Admin Dashboard"}
                            </h1>

                            <p className={heroStyles.description}>
                                {isDoctor
                                    ? "Access your patient records, manage appointments, and review medical reports securely from your dashboard."
                                    : "Manage clinic operations, doctors, staff, patient records, and system settings from a centralized control panel."
                                }
                            </p>

                            {/* Info Cards */}
                            <div className={heroStyles.infoCards.container}>
                                <div className={heroStyles.infoCards.card}>
                                    <h3 className={heroStyles.infoCards.cardTitle}>
                                        Secure Access
                                    </h3>
                                    <p className={heroStyles.infoCards.cardText}>
                                        Role-based login ensures that only authorized personnel can access sensitive medical data and administrative functions.
                                    </p>
                                </div>

                                <div className={heroStyles.infoCards.card}>
                                    <h3 className={heroStyles.infoCards.cardTitle}>
                                        Real-Time Updates
                                    </h3>
                                    <p className={heroStyles.infoCards.cardText}>
                                        Get real-time updates on appointments, patient records, and system notifications.
                                    </p>
                                </div>

                                <div className={heroStyles.infoCards.card}>
                                    <h3 className={heroStyles.infoCards.cardTitle}>
                                        Medical Dashboard
                                    </h3>
                                    <p className={heroStyles.infoCards.cardText}>
                                        Doctors can easily access patient records, manage appointments, and review medical reports securely from their dashboard.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default Hero;
