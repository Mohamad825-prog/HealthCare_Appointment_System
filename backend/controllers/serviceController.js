import { supabase } from "../config/supabase.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

// Helpers functions
// so this function can handle both JSON array strings and comma-separated strings for dates, instructions, and slots
const parseJsonArrayField = (field) => {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    if (typeof field === "string") {
        try {
            const parsed = JSON.parse(field);
            if (Array.isArray(parsed)) return parsed;
            return typeof parsed === "string" ? [parsed] : [];
        } catch {
            return field
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
        }
    }
    return [];
};

// This function converts an array of slot strings into a map where keys are dates (YYYY-MM-DD) and values are arrays of time slots.
function normalizeSlotsToMap(slotStrings = []) {
    const map = {};
    slotStrings.forEach((raw) => {
        const m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s*•\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!m) {
            // fallback: keep raw in an "unspecified" bucket
            map["unspecified"] = map["unspecified"] || [];
            map["unspecified"].push(raw);
            return;
        }
        const [, day, monShort, year, hour, minute, ampm] = m;
        const monthIdx = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            .findIndex(x => x.toLowerCase() === monShort.toLowerCase());
        const mm = String(monthIdx + 1).padStart(2, "0");
        const dd = String(Number(day)).padStart(2, "0");
        const dateKey = `${year}-${mm}-${dd}`; // YYYY-MM-DD
        const timeStr = `${String(Number(hour)).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm.toUpperCase()}`;
        map[dateKey] = map[dateKey] || [];
        map[dateKey].push(timeStr);
    });
    return map;
}

// This function takes the slots map and converts it back into an array of strings in the original format.
const sanitizePrice = (v) => Number(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;
const parseAvailability = (v) => {
    const s = String(v ?? "available").toLowerCase();
    return s === "available" || s === "true";
};

// Helper to convert a Supabase service row to the same object format as before (with _id, etc.)
function formatService(row) {
    return {
        _id: row.id,
        id: row.id,
        name: row.name,
        about: row.about,
        shortDescription: row.short_description,
        price: row.price,
        available: row.available,
        instructions: row.instructions || [],
        slots: row.slots || {},
        imageUrl: row.image_url,
        imagePublicId: row.image_public_id,
        dates: row.dates || [],
        totalAppointments: row.total_appointments || 0,
        completed: row.completed || 0,
        canceled: row.canceled || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// To create a new service
export async function createService(req, res) {
    try {
        const b = req.body || {};
        const instructions = parseJsonArrayField(b.instructions);
        const rawSlots = parseJsonArrayField(b.slots);
        const slots = normalizeSlotsToMap(rawSlots);
        const numericPrice = sanitizePrice(b.price);
        const available = parseAvailability(b.availability);

        let imageUrl = null;
        let imagePublicId = null;
        if (req.file) {
            try {
                const up = await uploadToCloudinary(req.file.path, "services");
                imageUrl = up?.secure_url || null;
                imagePublicId = up?.public_id || null;
            } catch (err) {
                console.error("Cloudinary upload error:", err);
            }
        }

        const { data: newService, error: insertError } = await supabase
            .from('services')
            .insert({
                name: b.name,
                about: b.about,
                short_description: b.shortDescription || "",
                price: numericPrice,
                available: available,
                instructions: instructions,
                slots: slots,
                image_url: imageUrl,
                image_public_id: imagePublicId,
                dates: [],   // can be computed later if needed
                total_appointments: 0,
                completed: 0,
                canceled: 0,
            })
            .select()
            .single();

        if (insertError) {
            console.error("Create service error:", insertError);
            return res.status(500).json({
                success: false,
                message: "Failed to create service",
            });
        }

        return res.status(201).json({
            success: true,
            data: formatService(newService),
            message: "Service created successfully",
        });
    } catch (err) {
        console.error("Create service error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to create service",
        });
    }
}

// To get all services
export async function getServices(req, res) {
    try {
        const { data: services, error } = await supabase
            .from('services')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const formatted = services.map(s => formatService(s));
        return res.status(200).json({
            success: true,
            data: formatted,
        });
    } catch (err) {
        console.error("Get services error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to get services",
        });
    }
}

// To get a single service by ID
export async function getServiceById(req, res) {
    try {
        const { id } = req.params;
        const { data: service, error } = await supabase
            .from('services')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    message: "Service not found",
                });
            }
            throw error;
        }

        return res.status(200).json({
            success: true,
            data: formatService(service),
        });
    } catch (err) {
        console.error("Get service by ID error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to get service",
        });
    }
}

// To update a service
export async function updateService(req, res) {
    try {
        const { id } = req.params;

        // Fetch existing service
        const { data: existing, error: fetchError } = await supabase
            .from('services')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    message: "Service not found",
                });
            }
            throw fetchError;
        }

        const b = req.body || {};
        const updateData = {};

        // To update each field if it's present in the request body
        if (b.name !== undefined) updateData.name = b.name;
        if (b.about !== undefined) updateData.about = b.about;
        if (b.shortDescription !== undefined) updateData.short_description = b.shortDescription;
        if (b.price !== undefined) updateData.price = sanitizePrice(b.price);
        if (b.availability !== undefined) updateData.available = parseAvailability(b.availability);
        if (b.instructions !== undefined) updateData.instructions = parseJsonArrayField(b.instructions);
        if (b.slots !== undefined) updateData.slots = normalizeSlotsToMap(parseJsonArrayField(b.slots));

        if (req.file) {
            try {
                const up = await uploadToCloudinary(req.file.path, "services");
                if (up?.secure_url) {
                    updateData.image_url = up.secure_url;
                    updateData.image_public_id = up.public_id || null;
                    if (existing.image_public_id) {
                        // It will remove the old image and replace it with new one if the image is updated for a service
                        try {
                            await deleteFromCloudinary(existing.image_public_id);
                        } catch (err) {
                            console.warn("Cloudinary delete failed:", err?.message || err);
                        }
                    }
                }
            } catch (err) {
                console.error("Cloudinary upload error:", err);
            }
        }

        const { data: updated, error: updateError } = await supabase
            .from('services')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error("Update service error:", updateError);
            return res.status(500).json({
                success: false,
                message: "Failed to update service",
            });
        }

        return res.status(200).json({
            success: true,
            data: formatService(updated),
            message: "Service updated successfully",
        });
    } catch (err) {
        console.error("Update service error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to update service",
        });
    }
}

// To delete a service
export async function deleteService(req, res) {
    try {
        const { id } = req.params;

        // Fetch existing to get image public id
        const { data: existing, error: fetchError } = await supabase
            .from('services')
            .select('image_public_id')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    message: "Service not found",
                });
            }
            throw fetchError;
        }

        if (existing.image_public_id) {
            try {
                await deleteFromCloudinary(existing.image_public_id);
            } catch (err) {
                console.warn("Failed to delete image from Cloudinary:", err?.message || err);
            }
        }

        const { error: deleteError } = await supabase
            .from('services')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error("Delete service error:", deleteError);
            return res.status(500).json({
                success: false,
                message: "Failed to delete service",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Service deleted successfully",
        });
    } catch (err) {
        console.error("Delete service error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to delete service",
        });
    }
}