#[derive(Clone, Copy, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }
}

#[derive(Clone, Copy, Debug, thiserror::Error, PartialEq, Eq)]
pub enum LayoutError {
    #[error("output must be at least 2x2 physical pixels")]
    TooSmall,
}

pub fn calculate_quadrants(width: u32, height: u32) -> Result<[Rect; 4], LayoutError> {
    if width < 2 || height < 2 {
        return Err(LayoutError::TooSmall);
    }

    let left = width / 2;
    let top = height / 2;
    Ok([
        Rect::new(0, 0, left, top),
        Rect::new(left as i32, 0, width - left, top),
        Rect::new(0, top as i32, left, height - top),
        Rect::new(left as i32, top as i32, width - left, height - top),
    ])
}

pub fn calculate_output_zoom(configured_zoom: f64, scale_factor: f64) -> f64 {
    let zoom = if configured_zoom.is_finite() && configured_zoom > 0.0 {
        configured_zoom
    } else {
        1.0
    };
    let scale = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };

    ((zoom / scale) * 10_000.0).round() / 10_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quadrants_cover_odd_physical_size_without_gaps() {
        assert_eq!(
            calculate_quadrants(101, 51).unwrap(),
            [
                Rect::new(0, 0, 50, 25),
                Rect::new(50, 0, 51, 25),
                Rect::new(0, 25, 50, 26),
                Rect::new(50, 25, 51, 26),
            ]
        );
    }

    #[test]
    fn output_zoom_cancels_os_scale() {
        assert_eq!(calculate_output_zoom(1.0, 2.0), 0.5);
        assert_eq!(calculate_output_zoom(1.25, 1.25), 1.0);
    }

    #[test]
    fn rejects_output_too_small_for_four_views() {
        assert_eq!(calculate_quadrants(1, 1080), Err(LayoutError::TooSmall));
    }
}
