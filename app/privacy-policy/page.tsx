'use client'

import Link from 'next/link'
import { Shield, Lock, Eye, FileText, ChevronLeft } from 'lucide-react'

export default function PrivacyPolicyPage() {
    const lastUpdated = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <Link
                    href="/"
                    className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-8"
                >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back to Home
                </Link>

                <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
                    {/* Header Banner */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-8 py-12 text-white">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                                <Shield className="w-8 h-8" />
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
                        </div>
                        <p className="text-blue-100 text-lg">
                            Transparency and security are at the core of CyArt Security Suite.
                        </p>
                    </div>

                    <div className="p-8 sm:p-12 space-y-10">
                        <section>
                            <div className="flex items-center gap-3 mb-4">
                                <FileText className="w-6 h-6 text-blue-600" />
                                <h2 className="text-xl font-bold">Introduction</h2>
                            </div>
                            <p className="text-slate-600 leading-relaxed">
                                Welcome to CyArt Security Suite. We are committed to protecting your privacy and ensuring that your personal data is handled securely and transparently. This Privacy Policy outlines how we collect, use, and safeguard your information when you use our security platform and agent services.
                            </p>
                        </section>

                        <section>
                            <div className="flex items-center gap-3 mb-4">
                                <Eye className="w-6 h-6 text-blue-600" />
                                <h2 className="text-xl font-bold">Information Collection</h2>
                            </div>
                            <div className="space-y-4">
                                <p className="text-slate-600 leading-relaxed">
                                    To provide our security services, we collect various types of information:
                                </p>
                                <ul className="list-disc pl-6 text-slate-600 space-y-2">
                                    <li><strong>Device Metadata:</strong> Information such as hostname, IP address, operating system, and hardware identifiers for device inventory and monitoring.</li>
                                    <li><strong>Security Logs:</strong> Data related to security events, including USB connection logs, network activity, and software execution attempts.</li>
                                    <li><strong>Account Information:</strong> If you are an administrator, we store your email address and authentication credentials.</li>
                                </ul>
                            </div>
                        </section>

                        <section>
                            <div className="flex items-center gap-3 mb-4">
                                <Lock className="w-6 h-6 text-blue-600" />
                                <h2 className="text-xl font-bold">Data Protection</h2>
                            </div>
                            <p className="text-slate-600 leading-relaxed">
                                We implement industry-standard security measures to protect your data from unauthorized access, alteration, or destruction. This includes the use of Content Security Policies (CSP), secure communication protocols, and robust encryption.
                            </p>
                            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                                <p className="text-sm text-blue-800">
                                    <strong>Proactive Security:</strong> Our platform is regularly audited for security vulnerabilities to ensure the highest level of protection for your enterprise data.
                                </p>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-4">Compliance</h2>
                            <p className="text-slate-600 leading-relaxed">
                                CyArt Security Suite is designed with compliance in mind, including support for GDPR and other relevant privacy regulations. We provide tools for administrators to manage data retention and access policies.
                            </p>
                        </section>

                        <footer className="pt-10 border-t border-slate-100 mt-12 text-center">
                            <p className="text-slate-500 text-sm">
                                Last updated: {lastUpdated}
                            </p>
                            <div className="mt-4 flex justify-center gap-6 text-slate-400">
                                <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
                                <Link href="#" className="hover:text-blue-600 transition-colors">Contact Support</Link>
                            </div>
                        </footer>
                    </div>
                </div>
            </div>
        </div>
    )
}
