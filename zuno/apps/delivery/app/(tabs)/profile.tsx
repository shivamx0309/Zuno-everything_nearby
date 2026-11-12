import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Linking,
  Platform,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Bike,
  Bell,
  User,
  Star,
  CheckCircle2,
  Headphones,
  FileText,
  LogOut,
  ChevronRight,
  Camera,
  X,
  Check,
  Edit3,
  Phone,
  AlertCircle,
  ShieldCheck,
  Mail,
  Car,
} from "lucide-react-native";
import {
  getCurrentDeliveryPartner,
  signOutDeliveryPartner,
  updateDeliveryPartnerProfile,
  DeliveryPartnerAccount,
  FALLBACK_DELIVERY_PARTNER,
} from "@/features/auth/api";
import { getBrandLogoSource } from "@/lib/assets";

// ZUNO Brand Design Tokens
const GREEN = "#0F5D3A";
const GREEN_SECONDARY = "#22A06B";
const LIGHT_GREEN = "#EAF4E5";
const BG = "#F8FAF6";
const DARK = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const CARD_BG = "#FFFFFF";

// Verified Support Contacts from Scaffold
const SUPPORT_PHONE = "+918887602317";
const SUPPORT_PHONE_DIAL = "++918887602317";
const SUPPORT_EMAIL = "zunonearby@gmail.com";

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80";

export default function DeliveryProfileScreen() {
  const router = useRouter();
  const [partner, setPartner] = useState<DeliveryPartnerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Modals state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [policyModalVisible, setPolicyModalVisible] = useState(false);
  const [signOutConfirmVisible, setSignOutConfirmVisible] = useState(false);

  // Edit form state
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editVehicleType, setEditVehicleType] = useState("");
  const [editVehicleNumber, setEditVehicleNumber] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Photo picker state
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const data = await getCurrentDeliveryPartner();
      setPartner(data || FALLBACK_DELIVERY_PARTNER);
    } catch (err) {
      console.error("[DeliveryProfile] Error loading profile:", err);
      setPartner(FALLBACK_DELIVERY_PARTNER);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  // Open Edit Profile Modal
  const openEditModal = () => {
    const current = partner || FALLBACK_DELIVERY_PARTNER;
    setEditFullName(current.fullName);
    setEditPhone(current.phone);
    setEditVehicleType(current.vehicleType);
    setEditVehicleNumber(current.vehicleNumber);
    setEditError(null);
    setEditSuccessMsg(null);
    setEditModalVisible(true);
  };

  // Handle Save Profile
  const handleSaveProfile = async () => {
    setEditError(null);
    const trimmedName = editFullName.trim();
    const trimmedPhone = editPhone.trim();
    const trimmedVehicleType = editVehicleType.trim();
    const trimmedVehicleNumber = editVehicleNumber.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setEditError("Please enter a valid full name (minimum 2 characters).");
      return;
    }

    // Phone validation (accept Indian phone numbers)
    const phoneDigits = trimmedPhone.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      setEditError("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (!trimmedVehicleType) {
      setEditError("Please enter vehicle model/type.");
      return;
    }

    if (!trimmedVehicleNumber) {
      setEditError("Please enter vehicle registration number.");
      return;
    }

    try {
      setEditSaving(true);
      const updated = await updateDeliveryPartnerProfile({
        fullName: trimmedName,
        phone: trimmedPhone.startsWith("+91") ? trimmedPhone : `+91 ${phoneDigits.slice(-10)}`,
        vehicleType: trimmedVehicleType,
        vehicleNumber: trimmedVehicleNumber,
      });
      setPartner(updated);
      setEditSuccessMsg("Profile details updated successfully!");
      setTimeout(() => {
        setEditModalVisible(false);
        setEditSuccessMsg(null);
      }, 1000);
    } catch (err: any) {
      setEditError(err?.message || "Failed to save profile. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  // Trigger Device File Picker
  const handleChoosePhotoFromDevice = () => {
    setPhotoError(null);
    if (Platform.OS === "web") {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.click();
      }
    } else {
      Alert.alert(
        "Device Gallery",
        "Select photo from device storage. Tap Choose Photo below to continue."
      );
    }
  };

  // File selected handler (Web)
  const handleFileChange = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    // Check mime type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setPhotoError("Unsupported format. Please select a JPG, PNG, or WEBP image.");
      return;
    }

    // Check size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setPhotoError("File size exceeds 5MB limit. Please choose a smaller photo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPreviewPhotoUri(reader.result);
        setPhotoError(null);
      }
    };
    reader.onerror = () => {
      setPhotoError("Failed to read image file from device.");
    };
    reader.readAsDataURL(file);
  };

  // Save selected photo
  const handleSavePhoto = async () => {
    if (!previewPhotoUri) return;
    try {
      setPhotoSaving(true);
      const updated = await updateDeliveryPartnerProfile({
        avatarUrl: previewPhotoUri,
      });
      setPartner(updated);
      setAvatarError(false);
      setPhotoModalVisible(false);
      setPreviewPhotoUri(null);
      Alert.alert("Photo Updated", "Your profile photo has been updated successfully.");
    } catch (err: any) {
      setPhotoError("Failed to save photo: " + (err?.message || "Unknown error"));
    } finally {
      setPhotoSaving(false);
    }
  };

  // Handle Sign Out
  const handleConfirmSignOut = async () => {
    try {
      setSignOutConfirmVisible(false);
      await signOutDeliveryPartner();
      router.replace("/(auth)/login" as never);
    } catch (err) {
      console.error("[DeliveryProfile] Error during signout:", err);
      router.replace("/(auth)/login" as never);
    }
  };

  // Handle Helpline Call
  const handleCallSupport = async () => {
    const url = `tel:${SUPPORT_PHONE_DIAL}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Helpline", `Call ZUNO Delivery Support Helpline at ${SUPPORT_PHONE}`);
      }
    } catch {
      Alert.alert("Helpline", `Call ZUNO Delivery Support Helpline at ${SUPPORT_PHONE}`);
    }
  };

  // Handle Support Email
  const handleEmailSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=Delivery%20Partner%20Support%20Request`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Support Email", `Write to ZUNO Support at ${SUPPORT_EMAIL}`);
      }
    } catch {
      Alert.alert("Support Email", `Write to ZUNO Support at ${SUPPORT_EMAIL}`);
    }
  };

  const currentAvatarUri = partner?.avatarUrl || DEFAULT_AVATAR;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={styles.loadingText}>Loading partner profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Hidden File Input on Web for Local Device Selection */}
      {Platform.OS === "web" && (
        <input
          type="file"
          ref={fileInputRef as any}
          accept="image/png,image/jpeg,image/webp"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      )}

      <View style={styles.screen}>
        {/* Header matching Reference */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image
              source={getBrandLogoSource()}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <View style={styles.partnerTag}>
              <Bike size={13} color={GREEN} />
              <Text style={styles.partnerTagText}>Delivery Partner</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Pressable
              style={styles.iconCircle}
              onPress={() => loadProfile()}
              accessibilityLabel="Notifications"
            >
              <Bell size={18} color={DARK} />
              <View style={styles.unreadDot} />
            </Pressable>

            <View style={styles.avatarHeaderWrapper}>
              {!avatarError ? (
                <Image
                  source={{ uri: currentAvatarUri }}
                  style={styles.avatarHeaderImg}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <View style={[styles.avatarHeaderImg, styles.avatarFallback]}>
                  <User size={16} color={GREEN} />
                </View>
              )}
              <View style={styles.onlineStatusDot} />
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadProfile();
              }}
              tintColor={GREEN}
            />
          }
        >
          {/* Page Title */}
          <View style={styles.titleSection}>
            <Text style={styles.pageTitle}>Partner Profile</Text>
          </View>

          {/* Profile Card */}
          <View style={styles.profileCard}>
            <View style={styles.avatarRow}>
              {/* Avatar with Camera Overlay */}
              <View style={styles.avatarContainer}>
                {!avatarError ? (
                  <Image
                    source={{ uri: currentAvatarUri }}
                    style={styles.profileAvatar}
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <View style={[styles.profileAvatar, styles.avatarFallbackLarge]}>
                    <User size={38} color={GREEN} />
                  </View>
                )}
                <Pressable
                  style={styles.cameraBadge}
                  onPress={() => {
                    setPreviewPhotoUri(null);
                    setPhotoError(null);
                    setPhotoModalVisible(true);
                  }}
                  accessibilityLabel="Change profile picture"
                >
                  <Camera size={14} color="#FFFFFF" />
                </Pressable>
              </View>

              {/* Name, Phone, Subtitle */}
              <View style={styles.partnerInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.partnerName}>
                    {partner?.fullName || "Rohit Patel"}
                  </Text>
                  <CheckCircle2 size={18} color={GREEN} />
                </View>
                <Text style={styles.partnerPhone}>
                  {partner?.phone || "+91 9876543210"}
                </Text>
                <Text style={styles.partnerSubtitle}>
                  Verified Delivery Partner • Renukoot
                </Text>
              </View>
            </View>

            {/* Active & Approved Account Row */}
            <Pressable
              style={styles.approvalRow}
              onPress={openEditModal}
              accessibilityLabel="Account status and edit profile"
            >
              <View style={styles.approvalLeft}>
                <View style={styles.approvalIconCircle}>
                  <Check size={14} color={GREEN} strokeWidth={2.5} />
                </View>
                <Text style={styles.approvalText}>Active & Approved Account</Text>
              </View>
              <ChevronRight size={18} color={MUTED} />
            </Pressable>

            {/* Quick Edit Profile Action */}
            <Pressable style={styles.editActionBtn} onPress={openEditModal}>
              <Edit3 size={14} color={GREEN} />
              <Text style={styles.editActionBtnText}>Edit Profile</Text>
            </Pressable>
          </View>

          {/* Stats Summary: Rating & Deliveries */}
          <View style={styles.statsRow}>
            {/* Rating Card */}
            <View style={styles.statCard}>
              <View style={styles.statIconCircleAmber}>
                <Star size={20} color="#F59E0B" fill="#F59E0B" />
              </View>
              <Text style={styles.statValue}>{partner?.rating?.toFixed(1) || "4.8"}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>

            {/* Deliveries Card */}
            <View style={styles.statCard}>
              <View style={styles.statIconCircleGreen}>
                <Bike size={20} color={GREEN} />
              </View>
              <Text style={styles.statValue}>
                {partner?.completedDeliveries ?? 142}
              </Text>
              <Text style={styles.statLabel}>Deliveries</Text>
            </View>
          </View>

          {/* Vehicle Information Card */}
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Vehicle Information</Text>

            <View style={styles.vehicleRow}>
              <View style={styles.vehicleIconCircle}>
                <Bike size={22} color={GREEN} />
              </View>

              <View style={styles.vehicleDetails}>
                <Text style={styles.vehicleModel}>
                  {partner?.vehicleType || "Honda Activa 6G"}
                </Text>
                <Text style={styles.vehicleReg}>
                  Reg No: {partner?.vehicleNumber || "UP64 AB 1234"}
                </Text>
              </View>

              <View style={styles.verifiedBadgePill}>
                <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
              </View>
            </View>
          </View>

          {/* General & Support Card */}
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>General & Support</Text>

            {/* Delivery Support Helpline */}
            <Pressable
              style={styles.actionRow}
              onPress={() => setSupportModalVisible(true)}
              accessibilityLabel="Delivery Support Helpline"
            >
              <View style={styles.actionIconCircle}>
                <Headphones size={18} color={GREEN} />
              </View>
              <Text style={styles.actionTitle}>Delivery Support Helpline</Text>
              <ChevronRight size={18} color={MUTED} />
            </Pressable>

            <View style={styles.dividerLight} />

            {/* Partner Terms & Safety Policy */}
            <Pressable
              style={styles.actionRow}
              onPress={() => setPolicyModalVisible(true)}
              accessibilityLabel="Partner Terms & Safety Policy"
            >
              <View style={styles.actionIconCircle}>
                <FileText size={18} color={GREEN} />
              </View>
              <Text style={styles.actionTitle}>Partner Terms & Safety Policy</Text>
              <ChevronRight size={18} color={MUTED} />
            </Pressable>

            <View style={styles.dividerLight} />

            {/* Sign Out Account */}
            <Pressable
              style={styles.actionRow}
              onPress={() => setSignOutConfirmVisible(true)}
              accessibilityLabel="Sign Out Account"
            >
              <View style={styles.actionIconCircleRed}>
                <LogOut size={18} color="#EF4444" />
              </View>
              <Text style={styles.actionTitleRed}>Sign Out Account</Text>
              <ChevronRight size={18} color="#EF4444" />
            </Pressable>
          </View>

          {/* Version Footer */}
          <Text style={styles.versionFooter}>
            ZUNO Delivery App v1.0.0 • Renukoot
          </Text>
        </ScrollView>
      </View>

      {/* -------------------- EDIT PROFILE MODAL -------------------- */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit Partner Profile</Text>
                <Text style={styles.modalSubtitle}>Update your verified information</Text>
              </View>
              <Pressable
                onPress={() => setEditModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={DARK} />
              </Pressable>
            </View>

            {editError && (
              <View style={styles.errorBanner}>
                <AlertCircle size={16} color="#DC2626" />
                <Text style={styles.errorBannerText}>{editError}</Text>
              </View>
            )}

            {editSuccessMsg && (
              <View style={styles.successBanner}>
                <Check size={16} color={GREEN} />
                <Text style={styles.successBannerText}>{editSuccessMsg}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Full Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={editFullName}
                  onChangeText={setEditFullName}
                  placeholder="Partner Name"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Phone Number</Text>
                <TextInput
                  style={styles.formInput}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+91 9876543210"
                  keyboardType="phone-pad"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.formHelp}>
                  Indian 10-digit mobile number linked to active deliveries.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Vehicle Model / Type</Text>
                <TextInput
                  style={styles.formInput}
                  value={editVehicleType}
                  onChangeText={setEditVehicleType}
                  placeholder="e.g. Honda Activa 6G"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Vehicle Registration Number</Text>
                <TextInput
                  style={styles.formInput}
                  value={editVehicleNumber}
                  onChangeText={setEditVehicleNumber}
                  placeholder="e.g. UP64 AB 1234"
                  autoCapitalize="characters"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setEditModalVisible(false)}
                disabled={editSaving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.saveBtn}
                onPress={handleSaveProfile}
                disabled={editSaving}
              >
                {editSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------- PHOTO PICKER MODAL -------------------- */}
      <Modal
        visible={photoModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Change Profile Photo</Text>
                <Text style={styles.modalSubtitle}>Choose image from device storage</Text>
              </View>
              <Pressable
                onPress={() => setPhotoModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={DARK} />
              </Pressable>
            </View>

            {photoError && (
              <View style={styles.errorBanner}>
                <AlertCircle size={16} color="#DC2626" />
                <Text style={styles.errorBannerText}>{photoError}</Text>
              </View>
            )}

            <View style={styles.photoPickerBody}>
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: previewPhotoUri || currentAvatarUri }}
                  style={styles.previewImage}
                />
              </View>

              <Text style={styles.photoPickerNotes}>
                Supported formats: JPG, PNG, WEBP (Max 5MB)
              </Text>

              <Pressable
                style={styles.selectFileBtn}
                onPress={handleChoosePhotoFromDevice}
              >
                <Camera size={18} color={GREEN} />
                <Text style={styles.selectFileBtnText}>
                  {previewPhotoUri ? "Choose Another Image" : "Select Image from Device"}
                </Text>
              </Pressable>

              <Text style={styles.storageNote}>
                Photo will be stored in your authenticated partner profile session.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setPhotoModalVisible(false)}
                disabled={photoSaving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.saveBtn,
                  !previewPhotoUri && styles.saveBtnDisabled,
                ]}
                onPress={handleSavePhoto}
                disabled={!previewPhotoUri || photoSaving}
              >
                {photoSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Photo</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------- DELIVERY SUPPORT MODAL -------------------- */}
      <Modal
        visible={supportModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSupportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Delivery Support Helpline</Text>
                <Text style={styles.modalSubtitle}>24/7 dedicated partner assistance</Text>
              </View>
              <Pressable
                onPress={() => setSupportModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={DARK} />
              </Pressable>
            </View>

            <View style={styles.supportInfoList}>
              <Pressable style={styles.supportContactCard} onPress={handleCallSupport}>
                <View style={styles.supportContactIcon}>
                  <Phone size={22} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportContactTitle}>Toll-Free Helpline</Text>
                  <Text style={styles.supportContactValue}>{SUPPORT_PHONE}</Text>
                  <Text style={styles.supportContactHint}>Tap to call directly</Text>
                </View>
                <ChevronRight size={18} color={GREEN} />
              </Pressable>

              <Pressable style={styles.supportContactCard} onPress={handleEmailSupport}>
                <View style={styles.supportContactIcon}>
                  <Mail size={22} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportContactTitle}>Partner Email Desk</Text>
                  <Text style={styles.supportContactValue}>{SUPPORT_EMAIL}</Text>
                  <Text style={styles.supportContactHint}>For payout & account inquiries</Text>
                </View>
                <ChevronRight size={18} color={GREEN} />
              </Pressable>

              <View style={styles.hubLocationBox}>
                <Text style={styles.hubLocationTitle}>Local Hub Office (Renukoot):</Text>
                <Text style={styles.hubLocationAddress}>
                  ZUNO Partner Center, Near Hindalco Colony, Main Market Road, Renukoot,
                  Sonbhadra, UP 231217
                </Text>
                <Text style={styles.hubTiming}>Hours: 7:00 AM – 11:00 PM Daily</Text>
              </View>
            </View>

            <Pressable
              style={styles.modalDismissBtn}
              onPress={() => setSupportModalVisible(false)}
            >
              <Text style={styles.modalDismissBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* -------------------- TERMS & SAFETY POLICY MODAL -------------------- */}
      <Modal
        visible={policyModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPolicyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Terms & Safety Policy</Text>
                <Text style={styles.modalSubtitle}>ZUNO Delivery Partner Guidelines</Text>
              </View>
              <Pressable
                onPress={() => setPolicyModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={DARK} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={true} style={{ maxHeight: 380, paddingRight: 4 }}>
              <View style={styles.policySection}>
                <Text style={styles.policyHeading}>1. Partner Code of Conduct</Text>
                <Text style={styles.policyText}>
                  Delivery partners represent ZUNO. Treat customers, store staff, and the
                  general public with courtesy and respect. Maintain proper hygiene, handle
                  packages with care, and keep insulated bags clean at all times.
                </Text>
              </View>

              <View style={styles.policySection}>
                <Text style={styles.policyHeading}>2. Road Safety & Protective Gear</Text>
                <Text style={styles.policyText}>
                  Helmets are mandatory on two-wheelers. Adhere strictly to local speed limits
                  and traffic signals across Renukoot and surrounding areas. Never use phone
                  screens while operating a vehicle.
                </Text>
              </View>

              <View style={styles.policySection}>
                <Text style={styles.policyHeading}>3. Customer OTP Verification</Text>
                <Text style={styles.policyText}>
                  Always verify the 4-digit customer delivery OTP before completing a delivery.
                  Never mark an order delivered without physical handover to prevent disputes
                  and protect your performance rating.
                </Text>
              </View>

              <View style={styles.policySection}>
                <Text style={styles.policyHeading}>4. Weekly Settlements & Earnings</Text>
                <Text style={styles.policyText}>
                  All approved earnings, base payouts, surge fees, and distance allowances are
                  settled every Tuesday directly into your verified bank account without
                  unauthorized deductions.
                </Text>
              </View>

              <View style={styles.policySection}>
                <Text style={styles.policyHeading}>5. Zero Tolerance Policy</Text>
                <Text style={styles.policyText}>
                  Tampering with customer food or packages, driving under the influence, or
                  submitting falsified delivery coordinates will lead to immediate permanent
                  deactivation.
                </Text>
              </View>
            </ScrollView>

            <Pressable
              style={styles.modalDismissBtn}
              onPress={() => setPolicyModalVisible(false)}
            >
              <Text style={styles.modalDismissBtnText}>I Understand</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* -------------------- SIGN OUT CONFIRMATION MODAL -------------------- */}
      <Modal
        visible={signOutConfirmVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSignOutConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 360 }]}>
            <View style={styles.signOutHeader}>
              <View style={styles.signOutIconContainer}>
                <LogOut size={26} color="#DC2626" />
              </View>
              <Text style={styles.signOutModalTitle}>Sign Out Account</Text>
              <Text style={styles.signOutModalSubtitle}>
                Are you sure you want to sign out from the ZUNO Delivery Partner app? You will
                need to sign in again to receive orders.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setSignOutConfirmVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.signOutBtn}
                onPress={handleConfirmSignOut}
              >
                <Text style={styles.signOutBtnText}>Sign Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F1",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandLogo: {
    width: 95,
    height: 32,
  },
  partnerTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 4,
  },
  partnerTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: GREEN,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    top: 6,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  avatarHeaderWrapper: {
    position: "relative",
  },
  avatarHeaderImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  onlineStatusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  avatarFallback: {
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80,
    gap: 14,
  },
  titleSection: {
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: DARK,
    letterSpacing: -0.4,
  },
  profileCard: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarContainer: {
    position: "relative",
  },
  profileAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  avatarFallbackLarge: {
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    elevation: 3,
  },
  partnerInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  partnerName: {
    fontSize: 18,
    fontWeight: "900",
    color: DARK,
    letterSpacing: -0.2,
  },
  partnerPhone: {
    fontSize: 13,
    color: MUTED,
    fontWeight: "600",
    marginTop: 2,
  },
  partnerSubtitle: {
    fontSize: 11.5,
    color: GREEN,
    fontWeight: "700",
    marginTop: 3,
  },
  approvalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAF9",
    borderWidth: 1,
    borderColor: "#EEF2EE",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  approvalLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  approvalIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  approvalText: {
    fontSize: 13,
    fontWeight: "800",
    color: GREEN,
  },
  editActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: LIGHT_GREEN,
    borderRadius: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  editActionBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: GREEN,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statIconCircleAmber: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statIconCircleGreen: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    color: DARK,
  },
  statLabel: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "600",
    marginTop: 2,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAEFEA",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: DARK,
    marginBottom: 12,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  vehicleIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleDetails: {
    flex: 1,
  },
  vehicleModel: {
    fontSize: 15,
    fontWeight: "900",
    color: DARK,
  },
  vehicleReg: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "600",
    marginTop: 2,
  },
  verifiedBadgePill: {
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  verifiedBadgeText: {
    color: GREEN,
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconCircleRed: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: DARK,
  },
  actionTitleRed: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: "#EF4444",
  },
  dividerLight: {
    height: 1,
    backgroundColor: "#F4F6F4",
  },
  versionFooter: {
    textAlign: "center",
    fontSize: 11.5,
    color: MUTED,
    marginTop: 10,
    fontWeight: "500",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 13,
    color: MUTED,
    marginTop: 10,
    fontWeight: "600",
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: DARK,
  },
  modalSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
    fontWeight: "500",
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: "600",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: LIGHT_GREEN,
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  successBannerText: {
    flex: 1,
    fontSize: 12,
    color: GREEN,
    fontWeight: "700",
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK,
    marginBottom: 4,
  },
  formInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: DARK,
    backgroundColor: "#F9FAFB",
  },
  formHelp: {
    fontSize: 11,
    color: MUTED,
    marginTop: 3,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: DARK,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    backgroundColor: "#9CA3AF",
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  photoPickerBody: {
    alignItems: "center",
    paddingVertical: 8,
  },
  previewContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: GREEN,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LIGHT_GREEN,
    marginBottom: 12,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  photoPickerNotes: {
    fontSize: 11.5,
    color: MUTED,
    textAlign: "center",
    marginBottom: 12,
  },
  selectFileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  selectFileBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: GREEN,
  },
  storageNote: {
    fontSize: 10.5,
    color: MUTED,
    textAlign: "center",
    fontStyle: "italic",
    paddingHorizontal: 12,
  },

  // Support list
  supportInfoList: {
    gap: 10,
    marginBottom: 14,
  },
  supportContactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAF9",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  supportContactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  supportContactTitle: {
    fontSize: 11.5,
    color: MUTED,
    fontWeight: "600",
  },
  supportContactValue: {
    fontSize: 14,
    fontWeight: "800",
    color: DARK,
    marginTop: 1,
  },
  supportContactHint: {
    fontSize: 10.5,
    color: GREEN,
    fontWeight: "700",
    marginTop: 2,
  },
  hubLocationBox: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 12,
  },
  hubLocationTitle: {
    fontSize: 11.5,
    fontWeight: "800",
    color: DARK,
    marginBottom: 2,
  },
  hubLocationAddress: {
    fontSize: 11.5,
    color: MUTED,
    lineHeight: 16,
  },
  hubTiming: {
    fontSize: 10.5,
    color: GREEN,
    fontWeight: "700",
    marginTop: 4,
  },
  modalDismissBtn: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  modalDismissBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  // Policy text
  policySection: {
    marginBottom: 12,
  },
  policyHeading: {
    fontSize: 13,
    fontWeight: "800",
    color: DARK,
    marginBottom: 3,
  },
  policyText: {
    fontSize: 11.5,
    color: MUTED,
    lineHeight: 16.5,
  },

  // Sign out modal
  signOutHeader: {
    alignItems: "center",
    paddingVertical: 6,
  },
  signOutIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  signOutModalTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: DARK,
    marginBottom: 6,
  },
  signOutModalSubtitle: {
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    lineHeight: 17,
  },
  signOutBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  signOutBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
